import "server-only";

import jwt from "jsonwebtoken";
import type { InterviewParticipantRole } from "@interviewhub/db";

/**
 * Long enough to outlast the scheduled slot plus an interview that runs over.
 * Shared by the room page's initial token, its LiveKit token, and the refresh
 * a reconnecting client asks for, so all three agree on how long a session is.
 */
export function interviewTokenLifetimeSeconds(durationMins: number): number {
  const GRACE_PERIOD_MINUTES = 30;
  return (durationMins + GRACE_PERIOD_MINUTES) * 60;
}

export interface MintInterviewTokenInput {
  interviewId: string;
  userId: string;
  role: InterviewParticipantRole;
  /**
   * Socket.IO's auto-reconnect resends the same token verbatim, and a
   * rejected token is only replaced when the client asks for a fresh one
   * (refreshInterviewToken, which re-runs the participant check). Size this
   * with interviewTokenLifetimeSeconds so a normal interview never needs to.
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
