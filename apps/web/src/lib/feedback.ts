import "server-only";

import { Prisma, prisma, type Feedback } from "@interviewhub/db";
import type { SubmitFeedbackInput } from "@interviewhub/types";

export class FeedbackError extends Error {}

/**
 * Authorized by participant row, not by platform role — the same boundary
 * authorizeInterviewAccess uses, and for the same reason. Being a RECRUITER
 * or an INTERVIEWER somewhere in the org says nothing about whether you sat
 * in on *this* interview, and a CANDIDATE is a participant of their own
 * interview but must never be able to score it. The only thing that
 * qualifies someone is an INTERVIEWER participant row for this interview.
 *
 * Upserts on (interviewId, interviewerId): resubmitting revises that
 * interviewer's own feedback rather than adding a second row, so one person
 * can't accidentally double their weight in the review by submitting twice.
 */
export async function submitFeedback(
  interviewerId: string,
  input: SubmitFeedbackInput,
): Promise<Feedback> {
  const participant = await prisma.interviewParticipant.findUnique({
    where: { interviewId_userId: { interviewId: input.interviewId, userId: interviewerId } },
    select: { role: true },
  });

  if (!participant || participant.role !== "INTERVIEWER") {
    throw new FeedbackError("Only an interviewer on this interview may submit feedback.");
  }

  const fields = {
    rubricScores: input.rubricScores as Prisma.InputJsonValue,
    notes: input.notes,
    recommendation: input.recommendation,
  };

  return prisma.feedback.upsert({
    where: {
      interviewId_interviewerId: { interviewId: input.interviewId, interviewerId },
    },
    create: { interviewId: input.interviewId, interviewerId, ...fields },
    update: fields,
  });
}
