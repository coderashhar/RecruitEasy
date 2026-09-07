import "server-only";

import { prisma, type Interview, type InterviewStatus } from "@interviewhub/db";
import type { RescheduleInterviewInput, UpdateInterviewStatusInput } from "@interviewhub/types";
import { findInterviewerConflict } from "./scheduling";

export class LifecycleError extends Error {}

/**
 * Legal status transitions. COMPLETED, CANCELLED, and NO_SHOW are terminal —
 * an interview that already happened (or was called off) cannot be dragged
 * back to SCHEDULED or IN_PROGRESS, unlike an Application's status, which a
 * recruiter can freely move in either direction. The difference is that a
 * status here has real consequences already attached to it (a room existed,
 * a token was minted, other people's calendars were held) that an illegal
 * transition would misrepresent, not just relabel.
 */
const LEGAL_TRANSITIONS: Record<InterviewStatus, readonly InterviewStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

async function loadInterviewInOrg(orgId: string, interviewId: string): Promise<Interview> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId } } },
  });
  if (!interview) {
    throw new LifecycleError("Interview not found in your organization.");
  }
  return interview;
}

export async function updateInterviewStatus(
  orgId: string,
  actorId: string,
  input: UpdateInterviewStatusInput,
): Promise<Interview> {
  const interview = await loadInterviewInOrg(orgId, input.interviewId);

  if (!LEGAL_TRANSITIONS[interview.status].includes(input.status)) {
    throw new LifecycleError(`Cannot move an interview from ${interview.status} to ${input.status}.`);
  }

  return prisma.$transaction(async (tx) => {
    // Re-asserts the status we validated against as part of the write itself.
    // The read above happened outside this transaction, so without this two
    // concurrent transitions would both pass the check and the later write
    // would win — quietly moving an interview out of a terminal state that
    // LEGAL_TRANSITIONS says can never be left.
    const { count } = await tx.interview.updateMany({
      where: { id: interview.id, status: interview.status },
      data: { status: input.status },
    });

    if (count === 0) {
      throw new LifecycleError("This interview was changed by someone else — reload and try again.");
    }

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "interview.status_changed",
        target: interview.id,
        meta: { from: interview.status, to: input.status },
      },
    });

    return tx.interview.findUniqueOrThrow({ where: { id: interview.id } });
  });
}

/**
 * Only a still-SCHEDULED interview can be rescheduled. An interview that's
 * IN_PROGRESS, or already reached a terminal state, needs a new interview
 * (via scheduleInterviewForOrg), not a rewrite of what already happened to
 * this one.
 */
export async function rescheduleInterview(
  orgId: string,
  actorId: string,
  input: RescheduleInterviewInput,
): Promise<Interview> {
  const interview = await loadInterviewInOrg(orgId, input.interviewId);

  if (interview.status !== "SCHEDULED") {
    throw new LifecycleError(`Cannot reschedule an interview that is ${interview.status}.`);
  }

  const interviewerIds = (
    await prisma.interviewParticipant.findMany({
      where: { interviewId: interview.id, role: "INTERVIEWER" },
      select: { userId: true },
    })
  ).map((p) => p.userId);

  // Excludes this interview's own current booking — otherwise every
  // reschedule would conflict with the slot it is itself trying to move out of.
  if (
    await findInterviewerConflict(
      interviewerIds,
      input.scheduledAt,
      input.durationMins,
      interview.id,
    )
  ) {
    throw new LifecycleError("One or more interviewers are already booked at that time.");
  }

  return prisma.$transaction(async (tx) => {
    // Same reasoning as updateInterviewStatus: pin the status we validated
    // against into the write, so a reschedule can't land on an interview that
    // was cancelled or started between the read and this update.
    const { count } = await tx.interview.updateMany({
      where: { id: interview.id, status: "SCHEDULED" },
      data: { scheduledAt: input.scheduledAt, durationMins: input.durationMins },
    });

    if (count === 0) {
      throw new LifecycleError("This interview was changed by someone else — reload and try again.");
    }

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "interview.rescheduled",
        target: interview.id,
        meta: {
          from: { scheduledAt: interview.scheduledAt, durationMins: interview.durationMins },
          to: { scheduledAt: input.scheduledAt, durationMins: input.durationMins },
        },
      },
    });

    return tx.interview.findUniqueOrThrow({ where: { id: interview.id } });
  });
}
