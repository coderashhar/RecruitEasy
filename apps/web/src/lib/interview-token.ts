import "server-only";

import jwt from "jsonwebtoken";
import type { InterviewParticipantRole } from "@interviewhub/db";

export interface MintInterviewTokenInput {
  interviewId: string;
  userId: string;
  role: InterviewParticipantRole;
}

/**
 * Signs the short-lived token apps/realtime/src/auth.ts verifies before letting
 * a socket join a room. The payload shape mirrors
 * apps/realtime/src/server.integration.test.ts's tokenFor() exactly, and must
 * keep satisfying interviewTokenClaimsSchema in packages/types/src/interview.ts
 * — that schema runs on the other side of a process boundary, so a shape drift
 * here fails a real join at connect time, not at compile time.
 */
export function mintInterviewToken({ interviewId, userId, role }: MintInterviewTokenInput): string {
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) {
    throw new Error("REALTIME_JWT_SECRET is not set — cannot mint an interview join token.");
  }

  return jwt.sign({ interviewId, userId, role }, secret, {
    algorithm: "HS256",
    expiresIn: "10m",
  });
}
