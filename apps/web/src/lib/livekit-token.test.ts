import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { decodeJwt } from "jose";

const ORIGINAL = {
  key: process.env.LIVEKIT_API_KEY,
  secret: process.env.LIVEKIT_API_SECRET,
  url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
};

const { mintVideoToken, isLiveKitConfigured } = await import("./livekit-token.js");

beforeEach(() => {
  process.env.LIVEKIT_API_KEY = "APItest";
  process.env.LIVEKIT_API_SECRET = "s".repeat(32);
  process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://example.livekit.cloud";
});

afterEach(() => {
  process.env.LIVEKIT_API_KEY = ORIGINAL.key;
  process.env.LIVEKIT_API_SECRET = ORIGINAL.secret;
  process.env.NEXT_PUBLIC_LIVEKIT_URL = ORIGINAL.url;
});

const input = {
  roomName: "interview_abc",
  userId: "user_1",
  displayName: "Ada Lovelace",
  expiresInSeconds: 5400,
};

describe("isLiveKitConfigured", () => {
  test("true only when all three variables are present", () => {
    expect(isLiveKitConfigured()).toBe(true);

    // Video is optional infrastructure — the room degrades to editor-and-chat
    // rather than failing to render, so each variable has to be able to
    // switch it off on its own.
    for (const key of [
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
      "NEXT_PUBLIC_LIVEKIT_URL",
    ] as const) {
      const kept = process.env[key];
      delete process.env[key];
      expect(isLiveKitConfigured()).toBe(false);
      process.env[key] = kept;
    }
  });
});

describe("mintVideoToken", () => {
  test("scopes the grant to this one interview room", async () => {
    const claims = decodeJwt(await mintVideoToken(input)) as {
      video?: { room?: string; roomJoin?: boolean; canPublish?: boolean; canSubscribe?: boolean };
    };

    // The regression this guards: a grant with roomJoin but no explicit room
    // would be replayable against any other interview's room, bypassing the
    // participant check that authorizeInterviewAccess makes exactly once.
    expect(claims.video?.room).toBe("interview_abc");
    expect(claims.video?.roomJoin).toBe(true);
    expect(claims.video?.canPublish).toBe(true);
    expect(claims.video?.canSubscribe).toBe(true);
  });

  test("carries the participant's identity and display name", async () => {
    const claims = decodeJwt(await mintVideoToken(input)) as { sub?: string; name?: string };

    expect(claims.sub).toBe("user_1");
    expect(claims.name).toBe("Ada Lovelace");
  });

  test("expiry reflects the caller-supplied duration", async () => {
    const claims = decodeJwt(await mintVideoToken(input)) as { exp?: number };
    const secondsFromNow = (claims.exp ?? 0) - Math.floor(Date.now() / 1000);

    // Sized from the interview's own length by the caller; there is no
    // refresh endpoint, so a short fixed TTL would drop people mid-call.
    expect(secondsFromNow).toBeGreaterThan(5000);
    expect(secondsFromNow).toBeLessThanOrEqual(5400);
  });

  test("throws rather than minting an unsigned token when the secret is missing", async () => {
    delete process.env.LIVEKIT_API_SECRET;

    await expect(mintVideoToken(input)).rejects.toThrow(/LIVEKIT_API_SECRET/);
  });
});
