import "server-only";

import { prisma } from "@interviewhub/db";
import { INTERVIEWER_CAPABLE_ROLES, type InterviewObserverInput } from "@interviewhub/types";
import { notifyUser } from "./notifications";

export class ObserverError extends Error {}

// An interview that has ended has no room left to sit in on.
const OPEN_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;

async function loadOpenInterviewInOrg(orgId: string, interviewId: string) {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId } } },
    select: {
      id: true,
      status: true,
      application: { select: { candidate: { select: { name: true } }, job: { select: { title: true } } } },
    },
  });
  if (!interview) throw new ObserverError("Interview not found in your organization.");
  if (!OPEN_STATUSES.includes(interview.status as (typeof OPEN_STATUSES)[number])) {
    throw new ObserverError("This interview is over, so its observers can no longer change.");
  }
  return interview;
}

/**
 * Adds a silent, read-only participant to an interview. Same shape as
 * scheduleInterviewForOrg: the interview and the user are both proven to belong
 * to the caller's org before any write, and the mutation and its AuditLog row
 * share one transaction.
 *
 * The unique (interviewId, userId) index is what stops a second row for someone
 * already in the room — as candidate, interviewer or observer — so a lost race
 * surfaces as the same friendly error as the plain duplicate.
 */
export async function addInterviewObserver(orgId: string, actorId: string, input: InterviewObserverInput) {
  const interview = await loadOpenInterviewInOrg(orgId, input.interviewId);

  const user = await prisma.user.findFirst({
    where: { id: input.userId, orgId, role: { in: [...INTERVIEWER_CAPABLE_ROLES] } },
    select: { id: true },
  });
  if (!user) throw new ObserverError("That person can't observe interviews in this organization.");

  const existing = await prisma.interviewParticipant.findUnique({
    where: { interviewId_userId: { interviewId: interview.id, userId: user.id } },
    select: { role: true },
  });
  if (existing) {
    throw new ObserverError(
      existing.role === "OBSERVER" ? "They're already observing." : "They're already in this interview.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.interviewParticipant.create({
        data: { interviewId: interview.id, userId: user.id, role: "OBSERVER" },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: "interview.observer_added",
          target: interview.id,
          meta: { userId: user.id },
        },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new ObserverError("They're already in this interview.");
    throw err;
  }

  await notifyUser(user.id, {
    type: "interview.observer_added",
    title: "You were added as an observer",
    body: `You can watch the interview with ${interview.application.candidate.name} for ${interview.application.job.title}. You won't be able to edit the code.`,
    link: `/interview/${interview.id}`,
  });
}

/** Only OBSERVER rows can be removed here — the candidate and the panel are not this function's to touch. */
export async function removeInterviewObserver(orgId: string, actorId: string, input: InterviewObserverInput) {
  const interview = await loadOpenInterviewInOrg(orgId, input.interviewId);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.interviewParticipant.deleteMany({
      where: { interviewId: interview.id, userId: input.userId, role: "OBSERVER" },
    });
    if (count === 0) throw new ObserverError("They aren't observing this interview.");

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "interview.observer_removed",
        target: interview.id,
        meta: { userId: input.userId },
      },
    });
  });
}
