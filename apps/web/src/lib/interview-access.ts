import "server-only";

import { prisma, type Interview, type InterviewParticipantRole } from "@interviewhub/db";

export interface InterviewAccess {
  interview: Interview;
  participantRole: InterviewParticipantRole;
}

/**
 * The actual security boundary the realtime service depends on.
 *
 * apps/realtime/src/auth.ts's verifyInterviewToken only proves a token was
 * signed by us — it says nothing about whether the bearer belongs in this
 * particular room. That check has to happen here, once, before a token for
 * this interview is ever minted; there is deliberately no client-callable
 * token endpoint that could be asked for a token to someone else's interview.
 *
 * Returns null — not a thrown error — for "not a participant", so the caller
 * can 404 rather than reveal whether the interview exists at all.
 */
export async function authorizeInterviewAccess(
  interviewId: string,
  userId: string,
): Promise<InterviewAccess | null> {
  const participant = await prisma.interviewParticipant.findUnique({
    where: { interviewId_userId: { interviewId, userId } },
    include: { interview: true },
  });
  if (!participant) return null;

  return { interview: participant.interview, participantRole: participant.role };
}
