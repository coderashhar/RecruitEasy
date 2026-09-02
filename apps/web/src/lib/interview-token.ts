import "server-only";

import jwt from "jsonwebtoken";
import type { InterviewParticipantRole } from "@interviewhub/db";

export interface MintInterviewTokenInput {
  interviewId: string;
  userId: string;
  role: InterviewParticipantRole;
  /**
   * There's deliberately no client-callable token endpoint (see
   * interview-access.ts), and Socket.IO's auto-reconnect resends this same
   * token verbatim on every reconnect attempt — so a token that expires
   * before the interview's actual scheduled end would silently stop syncing
   * on the very first network blip past that point, with no refresh path to
   * recover. The caller must size this to the real session length (the
   * interview's own durationMins, not a flat guess), so pick a duration this
   * interview could plausibly still be live for.
   */
  expiresInSeconds: number;
}

/**
 * Signs the short-lived token apps/realtime/src/auth.ts verifies before letting
 * a socket join a room. The payload shape mirrors
 * apps/realtime/src/server.integration.test.ts's tokenFor() exactly, and must
 * keep satisfying interviewTokenClaimsSchema in packages/types/src/interview.ts
 * — that schema runs on the other side of a process boundary, so a shape drift
 * here fails a real join at connect time, not at compile time.
 */
export function mintInterviewToken({
  interviewId,
  userId,
  role,
  expiresInSeconds,
}: MintInterviewTokenInput): string {
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!secret) {
    throw new Error("REALTIME_JWT_SECRET is not set — cannot mint an interview join token.");
  }

  return jwt.sign({ interviewId, userId, role }, secret, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
  });
}
