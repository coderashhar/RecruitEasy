import "server-only";

import jwt from "jsonwebtoken";

/**
 * Google's OAuth 2.0 web-server flow, by hand over `fetch`.
 *
 * No `googleapis` dependency: this needs four endpoints and one JSON shape
 * each, against a spec that hasn't moved in a decade, and that package pulls
 * a generated client for every Google API there is into a bundle that already
 * has to fit Vercel's limits. Same call this repo made for the iCalendar
 * invite in lib/ics.ts.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/**
 * `calendar.events` writes the interview onto the person's own calendar;
 * `calendar.freebusy` reads *when* they are busy without reading *what* they
 * are doing — the narrowest pair that covers FR-5.3's "availability and
 * invites". `openid email` only names the account on the settings page, so
 * someone with two Google accounts can see which one they connected.
 *
 * Deliberately not `calendar` or `calendar.readonly`: both would hand this app
 * the contents of every meeting on the calendar, which it never reads.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;

export class GoogleOAuthError extends Error {}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** The exact URI that must also be registered in the Google Cloud console. */
export function googleRedirectUri(): string {
  return `${appUrl()}/api/google/callback`;
}

/**
 * Null when the app has no Google credentials, which every call site treats as
 * "the feature isn't offered" rather than an error — the same shape as
 * lib/storage.ts's `r2` and lib/email.ts's `resend`.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: googleRedirectUri() };
}

export function isGoogleCalendarConfigured(): boolean {
  return googleOAuthConfig() !== null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface OAuthState {
  /** Who started the flow. The callback trusts this over its own session. */
  userId: string;
  /** Where to send the browser afterwards — an app-relative path, always. */
  returnTo: string;
}

/**
 * The `state` parameter, as a short-lived HS256 JWT.
 *
 * It is the CSRF defence for the callback: without it, anyone could walk a
 * signed-in user onto `/api/google/callback?code=<attacker's code>` and bind
 * the attacker's calendar to that user's account. Signing binds the callback
 * to a flow this app actually started, and pinning `userId` into it means a
 * code issued for one person cannot be redeemed into another's row even if
 * the session changes mid-flow.
 *
 * Its own secret, not REALTIME_JWT_SECRET: that one is shared with
 * apps/realtime, and a token minted here must not be accepted there.
 */
export function signOAuthState(state: OAuthState, secret = process.env.CALENDAR_TOKEN_KEY): string {
  if (!secret) {
    throw new GoogleOAuthError("CALENDAR_TOKEN_KEY is not set — cannot start a calendar connection.");
  }
  return jwt.sign(state, secret, { algorithm: "HS256", expiresIn: 600 });
}

/** Null for anything that isn't a live, unmodified state this app signed. */
export function verifyOAuthState(
  token: string,
  secret = process.env.CALENDAR_TOKEN_KEY,
): OAuthState | null {
  if (!secret) return null;
  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof claims !== "object" || claims === null) return null;
    const { userId, returnTo } = claims as Record<string, unknown>;
    if (typeof userId !== "string" || typeof returnTo !== "string") return null;
    // An absolute URL here would make the callback an open redirect.
    return { userId, returnTo: returnTo.startsWith("/") ? returnTo : "/settings/calendar" };
  } catch {
    return null;
  }
}

/**
 * Where to send the browser to ask for consent.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google return a
 * refresh token. Google issues one only on the *first* consent for a client
 * unless consent is re-requested, so a user who reconnects after a disconnect
 * would otherwise come back with an access token that expires in an hour and
 * no way to renew it — the connection would silently stop working.
 */
export function googleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export interface GoogleTokens {
  accessToken: string;
  /** Absent on a refresh — Google returns one only with the first grant. */
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

function parseTokenResponse(payload: unknown, now: Date): GoogleTokens {
  const body = payload as Record<string, unknown>;
  const accessToken = body.access_token;
  const expiresIn = body.expires_in;

  if (typeof accessToken !== "string" || typeof expiresIn !== "number") {
    throw new GoogleOAuthError("Google returned a token response this app couldn't read.");
  }

  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    scope: typeof body.scope === "string" ? body.scope : "",
  };
}

async function postForm(url: string, body: URLSearchParams): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    // Never cached: these are one-shot credential exchanges.
    cache: "no-store",
  });
}

export async function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
  now: Date = new Date(),
): Promise<GoogleTokens> {
  const response = await postForm(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  );

  if (!response.ok) {
    throw new GoogleOAuthError(`Google refused the authorization code (HTTP ${response.status}).`);
  }
  return parseTokenResponse(await response.json(), now);
}

export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  now: Date = new Date(),
): Promise<GoogleTokens> {
  const response = await postForm(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  );

  if (!response.ok) {
    // 400 `invalid_grant` here is the revoked/expired case: the user took the
    // grant away from their Google account page, or it went unused for six
    // months. Callers disconnect the row rather than retrying forever.
    throw new GoogleOAuthError(`Google refused to refresh the token (HTTP ${response.status}).`);
  }
  return parseTokenResponse(await response.json(), now);
}

/** Which Google account consented. Best-effort: a missing email is not fatal. */
export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return typeof body.email === "string" ? body.email : null;
  } catch {
    return null;
  }
}

/**
 * Tells Google the grant is over, so disconnecting here also removes this app
 * from the user's Google account page. Best-effort: the local row is deleted
 * either way, and a token we can no longer use is not a token worth retrying.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await postForm(REVOKE_ENDPOINT, new URLSearchParams({ token }));
    return response.ok;
  } catch (err) {
    console.error("[google-oauth] token revocation failed", err);
    return false;
  }
}
