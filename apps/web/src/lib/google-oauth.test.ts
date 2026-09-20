import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  GOOGLE_CALENDAR_SCOPES,
  googleAuthUrl,
  googleOAuthConfig,
  GoogleOAuthError,
  googleRedirectUri,
  isGoogleCalendarConfigured,
  refreshAccessToken,
  revokeToken,
  signOAuthState,
  verifyOAuthState,
} from "./google-oauth";

const SECRET = randomBytes(32).toString("hex");
const CONFIG = {
  clientId: "client-id.apps.googleusercontent.com",
  clientSecret: "client-secret",
  redirectUri: "https://hub.example.com/api/google/callback",
};

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_APP_URL"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  test("is absent until both halves of the OAuth client are set", () => {
    expect(googleOAuthConfig()).toBeNull();

    process.env.GOOGLE_CLIENT_ID = "id";
    expect(googleOAuthConfig()).toBeNull();

    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(isGoogleCalendarConfigured()).toBe(true);
  });

  test("derives the redirect URI from the app's public origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://hub.example.com";
    // Must match the URI registered in the Google console character for
    // character, so this is the one place it is allowed to be written.
    expect(googleRedirectUri()).toBe("https://hub.example.com/api/google/callback");
  });

  test("falls back to localhost in development", () => {
    expect(googleRedirectUri()).toBe("http://localhost:3000/api/google/callback");
  });
});

describe("googleAuthUrl", () => {
  test("asks for offline access and a fresh consent", () => {
    const url = new URL(googleAuthUrl(CONFIG, "state-token"));

    // Without both of these Google withholds the refresh token on a
    // reconnect, and the connection dies silently an hour later.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  });

  test("requests free/busy and event scopes, and nothing that reads event contents", () => {
    const scopes = new URL(googleAuthUrl(CONFIG, "s")).searchParams.get("scope")?.split(" ") ?? [];

    expect(scopes).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/calendar.readonly");
  });
});

describe("OAuth state", () => {
  test("round-trips the user and return path", () => {
    const token = signOAuthState({ userId: "user_1", returnTo: "/settings/calendar" }, SECRET);
    expect(verifyOAuthState(token, SECRET)).toEqual({
      userId: "user_1",
      returnTo: "/settings/calendar",
    });
  });

  test("rejects a state signed with a different secret", () => {
    const token = signOAuthState({ userId: "user_1", returnTo: "/settings/calendar" }, SECRET);
    expect(verifyOAuthState(token, randomBytes(32).toString("hex"))).toBeNull();
  });

  test("rejects an expired state", () => {
    const token = jwt.sign({ userId: "user_1", returnTo: "/x" }, SECRET, { expiresIn: -10 });
    expect(verifyOAuthState(token, SECRET)).toBeNull();
  });

  test("rejects a state whose claims are the wrong shape", () => {
    const token = jwt.sign({ userId: 42 }, SECRET, { expiresIn: 600 });
    expect(verifyOAuthState(token, SECRET)).toBeNull();
  });

  test("rejects garbage", () => {
    expect(verifyOAuthState("not-a-jwt", SECRET)).toBeNull();
  });

  test("refuses to sign without a secret, rather than signing with an empty one", () => {
    expect(() => signOAuthState({ userId: "u", returnTo: "/" }, undefined)).toThrow(GoogleOAuthError);
    expect(verifyOAuthState("anything", undefined)).toBeNull();
  });

  test("an absolute returnTo is replaced, so the callback can't be an open redirect", () => {
    const token = jwt.sign(
      { userId: "user_1", returnTo: "https://evil.example.com/steal" },
      SECRET,
      { expiresIn: 600 },
    );
    expect(verifyOAuthState(token, SECRET)?.returnTo).toBe("/settings/calendar");
  });
});

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("exchangeCodeForTokens", () => {
  const NOW = new Date("2026-09-20T10:00:00.000Z");

  test("reads the token response and turns expires_in into an instant", async () => {
    stubFetch({
      json: async () => ({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3599,
        scope: "openid email",
      }),
    });

    const tokens = await exchangeCodeForTokens(CONFIG, "auth-code", NOW);

    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.scope).toBe("openid email");
    expect(tokens.expiresAt.toISOString()).toBe("2026-09-20T10:59:59.000Z");
  });

  test("posts the code as a form, with the client credentials", async () => {
    const fetchMock = stubFetch({
      json: async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 }),
    });

    await exchangeCodeForTokens(CONFIG, "auth-code", NOW);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = init.body as URLSearchParams;
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe(CONFIG.clientSecret);
  });

  test("throws when Google refuses the code", async () => {
    stubFetch({ ok: false, status: 400 });
    await expect(exchangeCodeForTokens(CONFIG, "bad-code", NOW)).rejects.toThrow(GoogleOAuthError);
  });

  test("throws when the response is missing the fields it needs", async () => {
    stubFetch({ json: async () => ({ token_type: "Bearer" }) });
    await expect(exchangeCodeForTokens(CONFIG, "code", NOW)).rejects.toThrow(GoogleOAuthError);
  });
});

describe("refreshAccessToken", () => {
  const NOW = new Date("2026-09-20T10:00:00.000Z");

  test("a refresh with no new refresh token reports null, not an error", async () => {
    // The normal case: Google reissues only the access token, and the caller
    // must keep the refresh token it already holds.
    stubFetch({ json: async () => ({ access_token: "access-2", expires_in: 3600 }) });

    const tokens = await refreshAccessToken(CONFIG, "refresh-1", NOW);

    expect(tokens.accessToken).toBe("access-2");
    expect(tokens.refreshToken).toBeNull();
  });

  test("throws on invalid_grant, which is how a revoked connection shows up", async () => {
    stubFetch({ ok: false, status: 400 });
    await expect(refreshAccessToken(CONFIG, "revoked", NOW)).rejects.toThrow(GoogleOAuthError);
  });
});

describe("fetchGoogleAccountEmail", () => {
  test("returns the address", async () => {
    stubFetch({ json: async () => ({ email: "someone@example.com" }) });
    expect(await fetchGoogleAccountEmail("access-1")).toBe("someone@example.com");
  });

  test("is null rather than throwing when userinfo fails — it is only a label", async () => {
    stubFetch({ ok: false, status: 500 });
    expect(await fetchGoogleAccountEmail("access-1")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchGoogleAccountEmail("access-1")).toBeNull();
  });
});

describe("revokeToken", () => {
  test("reports whether Google accepted it, and never throws", async () => {
    stubFetch({ ok: true });
    expect(await revokeToken("refresh-1")).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await revokeToken("refresh-1")).toBe(false);
  });
});
