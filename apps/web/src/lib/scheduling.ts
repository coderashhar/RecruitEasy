import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { prisma, type Interview } from "@interviewhub/db";
import { INTERVIEWER_CAPABLE_ROLES, type ScheduleInterviewInput } from "@interviewhub/types";
import { syncInterviewToCalendars } from "./calendar-sync";
import { sendInterviewInvites } from "./interview-notices";

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
 *     belonging to a different org, and
 *   - observers pass the same test, and cannot also be on the panel: one
 *     person holds one participant row per interview.
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

  // Observers don't take part in the conflict check below: they watch, they
  // don't run the interview, so being booked elsewhere doesn't block them.
  const observerIds = [...new Set(input.observerIds)];
  if (observerIds.some((id) => interviewerIds.includes(id))) {
    throw new SchedulingError("Someone can't be both an interviewer and an observer.");
  }
  if (observerIds.length > 0) {
    const validObservers = await prisma.user.findMany({
      where: { id: { in: observerIds }, orgId, role: { in: [...INTERVIEWER_CAPABLE_ROLES] } },
      select: { id: true },
    });
    if (validObservers.length !== observerIds.length) {
      throw new SchedulingError("One or more observers are invalid for this organization.");
    }
  }

  if (await findInterviewerConflict(interviewerIds, input.scheduledAt, input.durationMins)) {
    throw new SchedulingError("One or more interviewers are already booked at that time.");
  }

  const result = await prisma.$transaction(async (tx) => {
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
            ...observerIds.map((id) => ({ userId: id, role: "OBSERVER" as const })),
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
        meta: { applicationId: application.id, interviewerIds, observerIds },
      },
    });

    return interview;
  });

  // Everyone invited gets the email and a calendar invite — the interviewers
  // too, who previously weren't told at all. after(), not a floating promise:
  // on Vercel the function can be frozen the moment the action responds, and
  // an unawaited send would be cut off with it. Registered only once the
  // transaction has committed, since after() also runs when a request fails.
  after(() => sendInterviewInvites(result.id, "scheduled"));

  // And onto the Google Calendar of everyone who connected one, so the
  // interview is on their day without anyone having to open an .ics.
  after(() => syncInterviewToCalendars(result.id, "scheduled"));

  return result;
}

/**
 * Which of `userIds` really are in this org, for a caller about to send them
 * somewhere outside the database. getInterviewerBusy scopes its own query, but
 * the Google free/busy lookup in lib/calendar-sync.ts takes bare ids, and an
 * unscoped list there would let a posted id reveal whether some other org's
 * user has a calendar connected.
 */
export async function orgMemberIds(orgId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: { id: { in: userIds }, orgId },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export interface BusyInterval {
  interviewerId: string;
  start: string;
  end: string;
}

/**
 * When each of `interviewerIds` is already booked between `from` and `to`, so
 * the scheduling grid can show conflicts before a time is chosen rather than
 * rejecting one afterwards. The same statuses findInterviewerConflict treats as
 * a conflict, plus IN_PROGRESS, which is busy right now.
 *
 * Ids from outside the caller's org are dropped rather than trusted: this is
 * called from a Server Action, and another org's calendar is not ours to read.
 * Returns bare intervals — never who the interview is with.
 */
export async function getInterviewerBusy(
  orgId: string,
  interviewerIds: string[],
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  if (interviewerIds.length === 0) return [];

  const rows = await prisma.interviewParticipant.findMany({
    where: {
      role: "INTERVIEWER",
      user: { id: { in: interviewerIds }, orgId },
      interview: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        // The longest interview is 240 minutes, so anything starting earlier
        // than that before the window cannot reach into it.
        scheduledAt: { gte: new Date(from.getTime() - 240 * 60_000), lt: to },
      },
    },
    select: { userId: true, interview: { select: { scheduledAt: true, durationMins: true } } },
  });

  return rows
    .map(({ userId, interview }) => ({
      interviewerId: userId,
      start: interview.scheduledAt.toISOString(),
      end: new Date(interview.scheduledAt.getTime() + interview.durationMins * 60_000).toISOString(),
    }))
    .filter((interval) => new Date(interval.end) > from);
}
