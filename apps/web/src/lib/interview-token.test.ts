import { describe, test, expect, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { interviewTokenClaimsSchema } from "@interviewhub/types";
import { mintInterviewToken } from "./interview-token.js";

const ORIGINAL_SECRET = process.env.REALTIME_JWT_SECRET;

beforeEach(() => {
  process.env.REALTIME_JWT_SECRET = "test-secret";
});

afterEach(() => {
  process.env.REALTIME_JWT_SECRET = ORIGINAL_SECRET;
});

describe("mintInterviewToken", () => {
  test("produces a token the realtime service's own verification accepts", () => {
    const token = mintInterviewToken({
      interviewId: "interview_1",
      userId: "user_1",
      role: "CANDIDATE",
      expiresInSeconds: 600,
    });

    // Mirrors apps/realtime/src/auth.ts's verifyInterviewToken exactly: pinned
    // algorithm, then schema parse. A shape drift between the two apps would
    // fail here, at the boundary, rather than only at a real socket connect.
    const decoded = jwt.verify(token, "test-secret", { algorithms: ["HS256"] });
    const claims = interviewTokenClaimsSchema.parse(decoded);

    expect(claims).toMatchObject({
      interviewId: "interview_1",
      userId: "user_1",
      role: "CANDIDATE",
    });
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
  });

  // The regression this guards: a flat short TTL against an interview that
  // can legitimately run up to 240 minutes (scheduleInterviewSchema) would
  // expire mid-session with no refresh path, silently stranding whoever's
  // still connected on the next reconnect attempt.
  test("expiry reflects the caller-supplied duration, not a fixed default", () => {
    const shortLived = mintInterviewToken({
      interviewId: "interview_1",
      userId: "user_1",
      role: "CANDIDATE",
      expiresInSeconds: 300,
    });
    const longLived = mintInterviewToken({
      interviewId: "interview_1",
      userId: "user_1",
      role: "CANDIDATE",
      expiresInSeconds: (240 + 30) * 60,
    });

    const shortClaims = interviewTokenClaimsSchema.parse(
      jwt.verify(shortLived, "test-secret", { algorithms: ["HS256"] }),
    );
    const longClaims = interviewTokenClaimsSchema.parse(
      jwt.verify(longLived, "test-secret", { algorithms: ["HS256"] }),
    );

    expect(longClaims.exp - shortClaims.exp).toBeGreaterThan(3000);
  });

  test("rejects verification under the wrong secret", () => {
    const token = mintInterviewToken({
      interviewId: "interview_1",
      userId: "user_1",
      role: "INTERVIEWER",
      expiresInSeconds: 600,
    });

    expect(() => jwt.verify(token, "wrong-secret", { algorithms: ["HS256"] })).toThrow();
  });

  test("throws rather than signing with an undefined secret", () => {
    delete process.env.REALTIME_JWT_SECRET;

    expect(() =>
      mintInterviewToken({ interviewId: "interview_1", userId: "user_1", role: "OBSERVER", expiresInSeconds: 600 }),
    ).toThrow(/REALTIME_JWT_SECRET/);
  });
});
