import type { InterviewStatus } from "@interviewhub/db";

// Pure, no "server-only": the room's header clock (a Client Component) and the
// server-rendered lists must agree on the moment an interview stops being
// something to join and becomes something to close out.

/**
 * How long past the end of its slot an interview is still treated as running.
 * The same allowance the room's join token gets (interview-token.ts), so the
 * moment the UI stops offering "Join" is the moment a fresh session would
 * stop being sized to cover the call.
 */
export const OUTCOME_GRACE_MINUTES = 30;

export function slotEndsAt(interview: { scheduledAt: Date; durationMins: number }): Date {
  return new Date(interview.scheduledAt.getTime() + interview.durationMins * 60_000);
}

/**
 * An interview whose slot, plus the grace period, is over, but which nobody
 * has marked completed, cancelled or a no-show — so it still reads as
 * SCHEDULED or IN_PROGRESS.
 *
 * Deliberately not resolved automatically: whether it happened, was missed, or
 * was a no-show is something only the people involved know, and a no-show
 * counts against the candidate. So these stay open, and the UI stops offering
 * to join them and asks for the outcome instead (handoff KI-10).
 */
export function isAwaitingOutcome(
  interview: { status: InterviewStatus; scheduledAt: Date; durationMins: number },
  now: Date = new Date(),
): boolean {
  if (interview.status !== "SCHEDULED" && interview.status !== "IN_PROGRESS") return false;
  return now.getTime() >= slotEndsAt(interview).getTime() + OUTCOME_GRACE_MINUTES * 60_000;
}
