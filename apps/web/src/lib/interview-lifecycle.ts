import "server-only";

import { after } from "next/server";
import { prisma, type Interview, type InterviewStatus } from "@interviewhub/db";
import type { RescheduleInterviewInput, UpdateInterviewStatusInput } from "@interviewhub/types";
import { syncInterviewToCalendars } from "./calendar-sync";
import { sendInterviewInvites } from "./interview-notices";
import { broadcastToRoom } from "./realtime-broadcast";
import { stopActiveRecording } from "./recording";
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

  const result = await prisma.$transaction(async (tx) => {
    // Re-asserts the status we validated against as part of the write itself.
    // The read above happened outside this transaction, so without this two
    // concurrent transitions would both pass the check and the later write
    // would win — quietly moving an interview out of a terminal state that
    // LEGAL_TRANSITIONS says can never be left.
    const { count } = await tx.interview.updateMany({
      where: { id: interview.id, status: interview.status },
      data: {
        status: input.status,
        // A calendar ignores a cancellation whose SEQUENCE isn't above the
        // invite it already holds, and would keep showing the interview.
        ...(input.status === "CANCELLED" && { icsSequence: { increment: 1 } }),
      },
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

  // Whoever is in the room right now sees the change without reloading: the
  // "interview is complete" banner, and the interviewer's feedback prompt.
  after(() => broadcastToRoom({ type: "status", interviewId: interview.id, status: input.status }));

  // Until now a cancelled interview stayed on everyone's calendar, and the
  // candidate was never told.
  if (input.status === "CANCELLED") {
    after(() => sendInterviewInvites(interview.id, "cancelled"));
    after(() => syncInterviewToCalendars(interview.id, "cancelled"));
  }

  // A recording left running after the interview is closed out would keep
  // spending the month's free LiveKit minutes on an empty room.
  if (input.status === "COMPLETED" || input.status === "CANCELLED" || input.status === "NO_SHOW") {
    after(() => stopActiveRecording(interview.id, null).then(() => undefined, (err) => {
      console.error(`[lifecycle] couldn't stop recording for interview ${interview.id}`, err);
    }));
  }

  return result;
}

/**
 * What someone on the panel may do to an interview's status without being a
 * recruiter: start it and close it out. Cancelling and no-shows stay with the
 * recruiter, since they tell the candidate things or count against them.
 */
export const INTERVIEWER_STATUS_MOVES = ["IN_PROGRESS", "COMPLETED"] as const;

/**
 * The panel's own path to updateInterviewStatus. Without it "Feedback due"
 * stays empty until a recruiter remembers to mark the interview completed,
 * which the interviewer who just ran it can't do.
 *
 * Eligibility is the INTERVIEWER participant row on this interview, not the
 * platform role, the same boundary submitFeedback uses: an interviewer
 * elsewhere in the org, or an observer here, gets nowhere.
 */
export async function updateInterviewStatusAsInterviewer(
  orgId: string,
  actorId: string,
  input: UpdateInterviewStatusInput,
): Promise<Interview> {
  if (!(INTERVIEWER_STATUS_MOVES as readonly InterviewStatus[]).includes(input.status)) {
    throw new LifecycleError("Only a recruiter can cancel an interview or mark a no-show.");
  }

  const seat = await prisma.interviewParticipant.findFirst({
    where: {
      interviewId: input.interviewId,
      userId: actorId,
      role: "INTERVIEWER",
      interview: { application: { job: { orgId } } },
    },
    select: { id: true },
  });
  if (!seat) {
    throw new LifecycleError("Only the interview's own interviewers can change its status.");
  }

  return updateInterviewStatus(orgId, actorId, input);
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

  const result = await prisma.$transaction(async (tx) => {
    // Same reasoning as updateInterviewStatus: pin the status we validated
    // against into the write, so a reschedule can't land on an interview that
    // was cancelled or started between the read and this update.
    const { count } = await tx.interview.updateMany({
      where: { id: interview.id, status: "SCHEDULED" },
      data: {
        scheduledAt: input.scheduledAt,
        durationMins: input.durationMins,
        // Without a higher SEQUENCE, calendars treat the new invite as stale
        // and leave the event at its old time.
        icsSequence: { increment: 1 },
        // Reminders already sent were for the old time.
        reminder24hSentAt: null,
        reminder1hSentAt: null,
      },
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

  after(() => sendInterviewInvites(interview.id, "rescheduled"));
  after(() => syncInterviewToCalendars(interview.id, "rescheduled"));

  return result;
}
