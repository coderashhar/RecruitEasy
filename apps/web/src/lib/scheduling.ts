import "server-only";

import { randomUUID } from "node:crypto";
import { prisma, type Interview } from "@interviewhub/db";
import type { ScheduleInterviewInput } from "@interviewhub/types";

export class SchedulingError extends Error {}

/**
 * User roles allowed to sit in an interview as the INTERVIEWER participant.
 * RECRUITER and ADMIN are included because either may run a live interview
 * themselves; CANDIDATE never is — a candidate cannot interview themselves.
 */
const INTERVIEWER_CAPABLE_ROLES = ["INTERVIEWER", "RECRUITER", "ADMIN"] as const;

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

  return prisma.$transaction(async (tx) => {
    const interview = await tx.interview.create({
      data: {
        applicationId: application.id,
        scheduledAt: input.scheduledAt,
        durationMins: input.durationMins,
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
