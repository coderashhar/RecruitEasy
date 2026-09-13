import "server-only";

import { prisma, type Interview, type InterviewParticipantRole } from "@interviewhub/db";

/** One row per person invited to the interview, connected or not. */
export interface RosterEntry {
  userId: string;
  name: string;
  role: InterviewParticipantRole;
}

export interface InterviewAccess {
  interview: Interview;
  participantRole: InterviewParticipantRole;
  /** Job title and candidate name, so the room can say which interview this is. */
  jobTitle: string;
  candidateName: string;
  /**
   * Everyone invited — not just whoever is currently connected. The room
   * resolves ids to names through this (presence and chat both arrive from
   * the realtime service carrying only a userId), and showing the full list
   * also makes "the interviewer hasn't arrived yet" legible instead of
   * indistinguishable from an empty room.
   */
  roster: RosterEntry[];
}

/**
 * The actual security boundary the realtime service depends on.
 *
 * apps/realtime/src/auth.ts's verifyInterviewToken only proves a token was
 * signed by us — it says nothing about whether the bearer belongs in this
 * particular room. That check has to happen here, before a token for this
 * interview is ever minted — by the room page, and again by
 * refreshInterviewToken on reconnect. Nothing mints a join token without it,
 * so no caller can obtain one for someone else's interview.
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
    include: {
      interview: {
        include: {
          application: {
            include: {
              job: { select: { title: true } },
              candidate: { select: { name: true } },
            },
          },
          participants: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!participant) return null;

  const { application, participants, ...interview } = participant.interview;

  return {
    interview,
    participantRole: participant.role,
    jobTitle: application.job.title,
    candidateName: application.candidate.name,
    roster: participants.map((entry) => ({
      userId: entry.user.id,
      name: entry.user.name,
      role: entry.role,
    })),
  };
}
