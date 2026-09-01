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

  test("rejects verification under the wrong secret", () => {
    const token = mintInterviewToken({
      interviewId: "interview_1",
      userId: "user_1",
      role: "INTERVIEWER",
    });

    expect(() => jwt.verify(token, "wrong-secret", { algorithms: ["HS256"] })).toThrow();
  });

  test("throws rather than signing with an undefined secret", () => {
    delete process.env.REALTIME_JWT_SECRET;

    expect(() =>
      mintInterviewToken({ interviewId: "interview_1", userId: "user_1", role: "OBSERVER" }),
    ).toThrow(/REALTIME_JWT_SECRET/);
  });
});
