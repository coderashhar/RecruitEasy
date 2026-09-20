import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const calendarAccount = {
  findUnique: vi.fn(),
  findMany: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
};

// Each method is forwarded through an arrow rather than handed over directly:
// vi.mock's factory is hoisted above these consts, so naming one in the object
// literal itself is a temporal-dead-zone error.
vi.mock("@interviewhub/db", () => ({
  prisma: {
    calendarAccount: {
      findUnique: (...args: unknown[]) => calendarAccount.findUnique(...args),
      findMany: (...args: unknown[]) => calendarAccount.findMany(...args),
      upsert: (...args: unknown[]) => calendarAccount.upsert(...args),
      update: (...args: unknown[]) => calendarAccount.update(...args),
      updateMany: (...args: unknown[]) => calendarAccount.updateMany(...args),
      delete: (...args: unknown[]) => calendarAccount.delete(...args),
    },
  },
}));

const exchangeCodeForTokens = vi.fn();
const refreshAccessToken = vi.fn();
const revokeToken = vi.fn();
const fetchGoogleAccountEmail = vi.fn();

vi.mock("./google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-oauth")>();
  return {
    ...actual,
    exchangeCodeForTokens: (...args: unknown[]) => exchangeCodeForTokens(...args),
    refreshAccessToken: (...args: unknown[]) => refreshAccessToken(...args),
    revokeToken: (...args: unknown[]) => revokeToken(...args),
    fetchGoogleAccountEmail: (...args: unknown[]) => fetchGoogleAccountEmail(...args),
  };
});

import {
  CalendarAccountError,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getCalendarAccount,
  isCalendarSyncConfigured,
  setCalendarSyncEnabled,
  usableCalendar,
  usableCalendarsFor,
} from "./calendar-accounts";
import { GoogleOAuthError } from "./google-oauth";
import { decryptToken, encryptToken } from "./token-cipher";

const KEY = randomBytes(32).toString("hex");
const NOW = new Date("2026-09-20T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.CALENDAR_TOKEN_KEY = KEY;
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.CALENDAR_TOKEN_KEY;
  vi.restoreAllMocks();
});

/** A stored row, with the token columns encrypted as the real ones are. */
function storedAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "cal_1",
    userId: "user_1",
    calendarId: "primary",
    accessToken: encryptToken("access-1"),
    refreshToken: encryptToken("refresh-1"),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    syncEnabled: true,
    ...overrides,
  };
}

describe("isCalendarSyncConfigured", () => {
  test("needs both the OAuth client and the cipher key", () => {
    expect(isCalendarSyncConfigured()).toBe(true);

    delete process.env.CALENDAR_TOKEN_KEY;
    // Half-configured is worse than unconfigured: the user would reach a
    // consent screen and then fail on the way back.
    expect(isCalendarSyncConfigured()).toBe(false);

    process.env.CALENDAR_TOKEN_KEY = KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    expect(isCalendarSyncConfigured()).toBe(false);
  });
});

describe("getCalendarAccount", () => {
  test("returns a summary and never the tokens", async () => {
    calendarAccount.findUnique.mockResolvedValue({
      accountEmail: "someone@example.com",
      calendarId: "primary",
      syncEnabled: true,
      createdAt: NOW,
    });

    const summary = await getCalendarAccount("user_1");

    expect(summary).toEqual({
      accountEmail: "someone@example.com",
      calendarId: "primary",
      syncEnabled: true,
      connectedAt: NOW,
    });
    expect(summary).not.toHaveProperty("accessToken");
    expect(summary).not.toHaveProperty("refreshToken");
  });

  test("is null when nothing is connected", async () => {
    calendarAccount.findUnique.mockResolvedValue(null);
    expect(await getCalendarAccount("user_1")).toBeNull();
  });
});

describe("connectGoogleCalendar", () => {
  test("stores both tokens encrypted, never in the clear", async () => {
    exchangeCodeForTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "openid email",
    });
    fetchGoogleAccountEmail.mockResolvedValue("someone@example.com");

    await connectGoogleCalendar("user_1", "auth-code");

    const { create } = calendarAccount.upsert.mock.calls[0][0];
    expect(create.accessToken).not.toBe("access-1");
    expect(create.refreshToken).not.toBe("refresh-1");
    expect(decryptToken(create.accessToken)).toBe("access-1");
    expect(decryptToken(create.refreshToken)).toBe("refresh-1");
    expect(create.accountEmail).toBe("someone@example.com");
  });

  test("reconnecting replaces the row and turns syncing back on", async () => {
    exchangeCodeForTokens.mockResolvedValue({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "openid email",
    });
    fetchGoogleAccountEmail.mockResolvedValue("someone@example.com");

    await connectGoogleCalendar("user_1", "auth-code");

    const { where, update } = calendarAccount.upsert.mock.calls[0][0];
    expect(where).toEqual({ userId_provider: { userId: "user_1", provider: "GOOGLE" } });
    expect(update.syncEnabled).toBe(true);
  });

  test("refuses a grant with no refresh token instead of storing a doomed one", async () => {
    // An access token alone expires in an hour with no way to renew it, so the
    // connection would appear to work and then quietly stop.
    exchangeCodeForTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: null,
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "openid email",
    });

    await expect(connectGoogleCalendar("user_1", "code")).rejects.toThrow(CalendarAccountError);
    expect(calendarAccount.upsert).not.toHaveBeenCalled();
  });

  test("a missing account email doesn't block the connection", async () => {
    exchangeCodeForTokens.mockResolvedValue({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "",
    });
    fetchGoogleAccountEmail.mockResolvedValue(null);

    await expect(connectGoogleCalendar("user_1", "code")).resolves.toBe("your Google account");
  });

  test("refuses when the deployment has no OAuth client", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(connectGoogleCalendar("user_1", "code")).rejects.toThrow(CalendarAccountError);
  });
});

describe("disconnectGoogleCalendar", () => {
  test("deletes the row, then revokes the grant with the decrypted token", async () => {
    calendarAccount.findUnique.mockResolvedValue({
      id: "cal_1",
      refreshToken: encryptToken("refresh-1"),
    });
    revokeToken.mockResolvedValue(true);

    expect(await disconnectGoogleCalendar("user_1")).toBe(true);
    expect(calendarAccount.delete).toHaveBeenCalledWith({ where: { id: "cal_1" } });
    expect(revokeToken).toHaveBeenCalledWith("refresh-1");
  });

  test("a revocation that fails still leaves the row deleted", async () => {
    calendarAccount.findUnique.mockResolvedValue({
      id: "cal_1",
      refreshToken: encryptToken("refresh-1"),
    });
    revokeToken.mockRejectedValue(new Error("offline"));

    await expect(disconnectGoogleCalendar("user_1")).resolves.toBe(true);
    expect(calendarAccount.delete).toHaveBeenCalled();
  });

  test("is false when there was nothing connected", async () => {
    calendarAccount.findUnique.mockResolvedValue(null);
    expect(await disconnectGoogleCalendar("user_1")).toBe(false);
    expect(calendarAccount.delete).not.toHaveBeenCalled();
  });
});

describe("setCalendarSyncEnabled", () => {
  test("pauses without touching the tokens", async () => {
    await setCalendarSyncEnabled("user_1", false);
    expect(calendarAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", provider: "GOOGLE" },
      data: { syncEnabled: false },
    });
  });
});

describe("usableCalendar", () => {
  test("returns the decrypted token while it is still valid", async () => {
    const calendar = await usableCalendar(storedAccount(), NOW);

    expect(calendar).toEqual({
      accountId: "cal_1",
      userId: "user_1",
      calendarId: "primary",
      accessToken: "access-1",
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  test("refreshes before expiry, not at it", async () => {
    // A token with one minute left would otherwise lapse between this check
    // and the request it was fetched for.
    refreshAccessToken.mockResolvedValue({
      accessToken: "access-2",
      refreshToken: null,
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "",
    });

    const calendar = await usableCalendar(
      storedAccount({ expiresAt: new Date(NOW.getTime() + 60_000) }),
      NOW,
    );

    expect(calendar?.accessToken).toBe("access-2");
    const { data } = calendarAccount.update.mock.calls[0][0];
    expect(decryptToken(data.accessToken)).toBe("access-2");
    // Google omitted a new refresh token, so the stored one must be left alone.
    expect(data).not.toHaveProperty("refreshToken");
  });

  test("stores a rotated refresh token when Google sends one", async () => {
    refreshAccessToken.mockResolvedValue({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      scope: "",
    });

    await usableCalendar(storedAccount({ expiresAt: NOW }), NOW);

    // Rotation invalidates the old one; keeping it would break the next refresh.
    const { data } = calendarAccount.update.mock.calls[0][0];
    expect(decryptToken(data.refreshToken)).toBe("refresh-2");
  });

  test("a revoked grant disconnects the account rather than retrying forever", async () => {
    refreshAccessToken.mockRejectedValue(new GoogleOAuthError("invalid_grant"));
    calendarAccount.delete.mockResolvedValue({});

    expect(await usableCalendar(storedAccount({ expiresAt: NOW }), NOW)).toBeNull();
    expect(calendarAccount.delete).toHaveBeenCalledWith({ where: { id: "cal_1" } });
  });

  test("a network failure keeps the row — the grant is probably fine", async () => {
    refreshAccessToken.mockRejectedValue(new Error("ECONNRESET"));

    expect(await usableCalendar(storedAccount({ expiresAt: NOW }), NOW)).toBeNull();
    expect(calendarAccount.delete).not.toHaveBeenCalled();
  });

  test("a paused account is not usable", async () => {
    expect(await usableCalendar(storedAccount({ syncEnabled: false }), NOW)).toBeNull();
  });

  test("tokens written under a different key are skipped, not thrown", async () => {
    const foreign = storedAccount({
      accessToken: encryptToken("access-1", randomBytes(32)),
      refreshToken: encryptToken("refresh-1", randomBytes(32)),
    });
    expect(await usableCalendar(foreign, NOW)).toBeNull();
  });
});

describe("usableCalendarsFor", () => {
  test("drops the users who have no working connection", async () => {
    // usableCalendarsFor resolves each account against the real clock, not the
    // fixed NOW the single-account tests pass in, so these expiries are
    // relative to now: one comfortably live, one already lapsed.
    calendarAccount.findMany.mockResolvedValue([
      storedAccount({ expiresAt: new Date(Date.now() + 3600_000) }),
      storedAccount({ id: "cal_2", userId: "user_2", expiresAt: new Date(Date.now() - 1000) }),
    ]);
    refreshAccessToken.mockRejectedValue(new GoogleOAuthError("invalid_grant"));
    calendarAccount.delete.mockResolvedValue({});

    const calendars = await usableCalendarsFor(["user_1", "user_2", "user_3"]);

    expect(calendars.map((c) => c.userId)).toEqual(["user_1"]);
  });

  test("asks nothing of the database for an empty list", async () => {
    expect(await usableCalendarsFor([])).toEqual([]);
    expect(calendarAccount.findMany).not.toHaveBeenCalled();
  });

  test("is empty when the deployment isn't configured", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(await usableCalendarsFor(["user_1"])).toEqual([]);
    expect(calendarAccount.findMany).not.toHaveBeenCalled();
  });
});
