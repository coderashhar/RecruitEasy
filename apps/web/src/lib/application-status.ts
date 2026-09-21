import type { ApplicationStatus } from "@interviewhub/db";

// Pure, no "server-only": the status <select> (a Client Component) asks before
// sending an overturn, and updateApplicationStatus refuses one that wasn't
// confirmed. Both read the rule from here so they can't disagree.

/** The hiring decision itself (PRD workflow step 10). Everything else is still in motion. */
export const FINAL_APPLICATION_STATUSES = ["HIRED", "REJECTED"] as const satisfies readonly ApplicationStatus[];

export function isFinalApplicationStatus(status: ApplicationStatus): boolean {
  return (FINAL_APPLICATION_STATUSES as readonly ApplicationStatus[]).includes(status);
}

/**
 * - `unchanged`: nothing to write, and nothing to tell the candidate again.
 * - `move`: any step between open stages, either direction, or to a decision.
 *   Moving back from INTERVIEWING to SCREENING is a routine correction.
 * - `overturn`: changing a decision already made. Still allowed, since
 *   decisions do get reversed, but only once confirmed: the candidate was
 *   already emailed the first decision, and will be emailed the new status.
 *
 * Deliberately not a full transition table. An application's status is a
 * label a recruiter sets by hand, and every move is a legitimate correction
 * of some mistake. The one move worth stopping to ask about is undoing a
 * decision the candidate has already been told (handoff KI-12).
 */
export type StatusChange = "unchanged" | "move" | "overturn";

export function classifyStatusChange(from: ApplicationStatus, to: ApplicationStatus): StatusChange {
  if (from === to) return "unchanged";
  return isFinalApplicationStatus(from) ? "overturn" : "move";
}
