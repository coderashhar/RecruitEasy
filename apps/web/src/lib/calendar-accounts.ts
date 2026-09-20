import "server-only";

import { prisma, type CalendarAccount } from "@interviewhub/db";
import {
  exchangeCodeForTokens,
  googleOAuthConfig,
  refreshAccessToken,
  revokeToken,
  type GoogleOAuthConfig,
  fetchGoogleAccountEmail,
  GoogleOAuthError,
} from "./google-oauth";
import { decryptToken, encryptToken, isTokenCipherConfigured } from "./token-cipher";

/**
 * Owns the `calendar_accounts` row: connecting one, keeping its access token
 * usable, and taking it away again. Nothing outside this module reads the two
 * token columns — they are ciphertext, and this is where the key is applied.
 */

export class CalendarAccountError extends Error {}

/**
 * Both halves must be present for the feature to work: the OAuth client to
 * obtain tokens, and the cipher key to store them. Missing either means the
 * UI offers nothing rather than half-working — a connect button that lands on
 * "CALENDAR_TOKEN_KEY is not set" after a consent screen is worse than no
 * button.
 */
export function isCalendarSyncConfigured(): boolean {
  return googleOAuthConfig() !== null && isTokenCipherConfigured();
}

function requireConfig(): GoogleOAuthConfig {
  const config = googleOAuthConfig();
  if (!config) {
    throw new CalendarAccountError("Calendar syncing isn't set up for this deployment.");
  }
  return config;
}

export interface CalendarAccountSummary {
  accountEmail: string;
  calendarId: string;
  syncEnabled: boolean;
  connectedAt: Date;
}

/** What the settings page shows. Never the tokens, encrypted or otherwise. */
export async function getCalendarAccount(userId: string): Promise<CalendarAccountSummary | null> {
  const account = await prisma.calendarAccount.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    select: { accountEmail: true, calendarId: true, syncEnabled: true, createdAt: true },
  });
  if (!account) return null;
  return {
    accountEmail: account.accountEmail,
    calendarId: account.calendarId,
    syncEnabled: account.syncEnabled,
    connectedAt: account.createdAt,
  };
}

/**
 * Finishes the OAuth flow: trades the code for tokens and stores them.
 *
 * Upsert rather than create: reconnecting an account that is already there
 * (after a revoked grant, or to switch Google accounts) must replace the row,
 * not collide on the unique index. `syncEnabled` is reset to true — someone
 * who just sat through a consent screen means to turn it on.
 */
export async function connectGoogleCalendar(userId: string, code: string): Promise<string> {
  const config = requireConfig();
  const tokens = await exchangeCodeForTokens(config, code);

  if (!tokens.refreshToken) {
    // Without one, the connection dies in an hour with no way back. Google
    // only omits it when consent was reused, which googleAuthUrl's
    // prompt=consent is there to prevent — so this is a real failure, not a
    // case to paper over by storing a token that will expire unrenewably.
    throw new CalendarAccountError(
      "Google didn't return a refresh token. Remove InterviewHub AI from your Google account's connected apps and try again.",
    );
  }

  const accountEmail = (await fetchGoogleAccountEmail(tokens.accessToken)) ?? "your Google account";

  await prisma.calendarAccount.upsert({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    create: {
      userId,
      provider: "GOOGLE",
      accountEmail,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptToken(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
    update: {
      accountEmail,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptToken(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      syncEnabled: true,
    },
  });

  return accountEmail;
}

/**
 * Forgets the calendar and tells Google to drop the grant.
 *
 * The `calendar_events` rows go with it by cascade. The events themselves are
 * deliberately left on the person's calendar: they are that person's copy of
 * a meeting that is still happening, and deleting them on the way out would
 * quietly erase interviews from an interviewer's day.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<boolean> {
  const account = await prisma.calendarAccount.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    select: { id: true, refreshToken: true },
  });
  if (!account) return false;

  await prisma.calendarAccount.delete({ where: { id: account.id } });

  // After the delete, so a revocation that hangs or fails can't leave the row
  // behind pointing at a grant the user believes they removed.
  try {
    await revokeToken(decryptToken(account.refreshToken));
  } catch (err) {
    console.error(`[calendar-accounts] couldn't revoke Google grant for user ${userId}`, err);
  }

  return true;
}

/** Pause or resume syncing without going through consent again. */
export async function setCalendarSyncEnabled(userId: string, enabled: boolean): Promise<void> {
  await prisma.calendarAccount.updateMany({
    where: { userId, provider: "GOOGLE" },
    data: { syncEnabled: enabled },
  });
}

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

/**
 * Refresh this far before expiry rather than at it, so a token doesn't lapse
 * between the check and the request it was fetched for.
 */
const REFRESH_MARGIN_MS = 2 * 60_000;

export interface UsableCalendar {
  accountId: string;
  userId: string;
  calendarId: string;
  accessToken: string;
}

/**
 * A live access token for one account, refreshing it first if it is at or near
 * expiry. Returns null when the account can no longer be used, having cleaned
 * up after itself — callers treat "no calendar" and "calendar we lost access
 * to" the same way, because there is nothing either can do about it.
 *
 * A refresh that Google rejects means the user revoked the grant from their
 * Google account page, or it expired unused. Deleting the row then is the
 * honest outcome: the settings page says "not connected", which is true,
 * instead of showing a connection that silently syncs nothing.
 */
export async function usableCalendar(
  account: Pick<
    CalendarAccount,
    "id" | "userId" | "calendarId" | "accessToken" | "refreshToken" | "expiresAt" | "syncEnabled"
  >,
  now: Date = new Date(),
): Promise<UsableCalendar | null> {
  if (!account.syncEnabled) return null;

  const config = googleOAuthConfig();
  if (!config) return null;

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptToken(account.accessToken);
    refreshToken = decryptToken(account.refreshToken);
  } catch (err) {
    // The key changed or the row is corrupt. Nothing here is recoverable and
    // retrying every sync forever isn't useful; the user reconnects.
    console.error(`[calendar-accounts] unreadable tokens on account ${account.id}`, err);
    return null;
  }

  if (account.expiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS) {
    return {
      accountId: account.id,
      userId: account.userId,
      calendarId: account.calendarId,
      accessToken,
    };
  }

  try {
    const refreshed = await refreshAccessToken(config, refreshToken, now);
    await prisma.calendarAccount.update({
      where: { id: account.id },
      data: {
        accessToken: encryptToken(refreshed.accessToken),
        expiresAt: refreshed.expiresAt,
        // Google usually omits it on a refresh; when it does rotate one, the
        // old refresh token stops working, so missing it here would be fatal.
        ...(refreshed.refreshToken ? { refreshToken: encryptToken(refreshed.refreshToken) } : {}),
      },
    });

    return {
      accountId: account.id,
      userId: account.userId,
      calendarId: account.calendarId,
      accessToken: refreshed.accessToken,
    };
  } catch (err) {
    if (err instanceof GoogleOAuthError) {
      console.error(`[calendar-accounts] grant lost for user ${account.userId}; disconnecting`, err);
      await prisma.calendarAccount.delete({ where: { id: account.id } }).catch(() => undefined);
      return null;
    }
    // A network blip or a Google outage: keep the row, try again next time.
    console.error(`[calendar-accounts] couldn't refresh token for user ${account.userId}`, err);
    return null;
  }
}

/**
 * Live tokens for each of `userIds` that has a working connection. Users
 * without one are simply absent — this is how the sync and the free/busy
 * lookup both find out who to talk to.
 */
export async function usableCalendarsFor(userIds: string[]): Promise<UsableCalendar[]> {
  if (userIds.length === 0 || !isCalendarSyncConfigured()) return [];

  const accounts = await prisma.calendarAccount.findMany({
    where: { userId: { in: userIds }, provider: "GOOGLE", syncEnabled: true },
  });

  const resolved = await Promise.all(accounts.map((account) => usableCalendar(account)));
  return resolved.filter((calendar): calendar is UsableCalendar => calendar !== null);
}
