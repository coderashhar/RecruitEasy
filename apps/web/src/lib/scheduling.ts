import "server-only";

import { randomUUID } from "node:crypto";
import { prisma, type Interview } from "@interviewhub/db";
import { INTERVIEWER_CAPABLE_ROLES, type ScheduleInterviewInput } from "@interviewhub/types";

export class SchedulingError extends Error {}

/**
 * True if any of `interviewerIds` already has a SCHEDULED interview whose
 * [start, end) window overlaps [scheduledAt, scheduledAt + durationMins).
 *
 * Application-level, not a DB constraint — Postgres can enforce this
 * atomically with an EXCLUDE USING gist constraint, but that's a schema
 * migration this session doesn't need to take on for the concurrent-race
 * case to be closed too. This check still closes the common case (two
 * separate, non-concurrent schedule calls) that today has zero guard at all.
 *
 * Exported for interview-lifecycle.ts: a reschedule runs this same check, and
 * `excludeInterviewId` is what stops an interview from conflicting with its
 * own current booking when only its time is changing.
 */
export async function findInterviewerConflict(
  interviewerIds: string[],
  scheduledAt: Date,
  durationMins: number,
  excludeInterviewId?: string,
): Promise<boolean> {
  const requestedEnd = new Date(scheduledAt.getTime() + durationMins * 60_000);

  // Superset fetch: any of this interviewer's SCHEDULED interviews starting
  // before our window ends. Narrowed to a true overlap in JS below, since
  // Prisma can't filter on `scheduledAt + durationMins` in a `where` clause.
  const candidates = await prisma.interviewParticipant.findMany({
    where: {
      userId: { in: interviewerIds },
      role: "INTERVIEWER",
      interview: {
        status: "SCHEDULED",
        scheduledAt: { lt: requestedEnd },
        ...(excludeInterviewId ? { id: { not: excludeInterviewId } } : {}),
      },
    },
    select: { interview: { select: { scheduledAt: true, durationMins: true } } },
  });

  return candidates.some(({ interview }) => {
    const existingEnd = new Date(
      interview.scheduledAt.getTime() + interview.durationMins * 60_000,
    );
    return existingEnd > scheduledAt;
  });
}

/**
 * Validates and creates an Interview plus its participants, all inside one org.
 *
 * Server Actions are directly invocable regardless of what the schedule form's
 * <select>/checkboxes render, so every constraint those controls imply has to be
 * re-checked here (same reasoning as onboarding/actions.ts's setRole):
 *   - the application must belong to the caller's own org — never one borrowed
 *     from another org's id guessed into the form, and
 *   - every interviewerId must be a real user of that org who can hold the
 *     INTERVIEWER participant role — never a CANDIDATE, and never a user
 *     belonging to a different org.
 */
export async function scheduleInterviewForOrg(
  orgId: string,
  actorId: string,
  input: ScheduleInterviewInput,
): Promise<Interview> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, job: { orgId } },
    select: { id: true, candidateId: true },
  });
  if (!application) {
    throw new SchedulingError("Application not found in your organization.");
  }

  const interviewerIds = [...new Set(input.interviewerIds)];
  const validInterviewers = await prisma.user.findMany({
    where: { id: { in: interviewerIds }, orgId, role: { in: [...INTERVIEWER_CAPABLE_ROLES] } },
    select: { id: true },
  });
  if (validInterviewers.length !== interviewerIds.length) {
    throw new SchedulingError("One or more interviewers are invalid for this organization.");
  }

  if (await findInterviewerConflict(interviewerIds, input.scheduledAt, input.durationMins)) {
    throw new SchedulingError("One or more interviewers are already booked at that time.");
  }

  return prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        applicationId: application.id,
        scheduledAt: input.scheduledAt,
        durationMins: input.durationMins,
        round: input.round,
        // Deliberately not the seed's `interview_${applicationId}` convention —
        // roomName is @unique, and a second interview on the same application
        // (a reschedule, a follow-up round) would collide on it.
        roomName: `interview_${randomUUID()}`,
        participants: {
          create: [
            { userId: application.candidateId, role: "CANDIDATE" },
            ...interviewerIds.map((id) => ({ userId: id, role: "INTERVIEWER" as const })),
          ],
        },
      },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "interview.scheduled",
        target: interview.id,
        meta: { applicationId: application.id, interviewerIds },
      },
    });

    return interview;
  });
}
