import type { IntegritySignalType } from "@interviewhub/db";

// No "server-only": the room (a Client Component), the candidate dashboard and
// the review page all read these, and they must say the same thing. What the
// candidate is told is monitored and what the reviewer is shown come from one
// list, so neither can drift into describing something the other doesn't.

/** Typed against the enum, so a new signal type is a compile error until it is labelled here. */
export const INTEGRITY_SIGNAL_LABEL: Record<IntegritySignalType, string> = {
  TAB_BLUR: "Switched away from the tab",
  PASTE: "Pasted into the editor",
  FULLSCREEN_EXIT: "Left full screen",
};

/**
 * Shown to the candidate before and during the interview (PRD §13: disclose
 * monitoring to candidates). Keep it accurate to what interview-room.tsx
 * actually sends — in particular, paste content is never collected.
 */
export const INTEGRITY_DISCLOSURE = {
  summary:
    "During the interview, the room notes when you switch away from its tab, paste into the code editor, or leave full screen.",
  detail:
    "Only the event, its time and a paste's length are kept — never what you pasted. Your interviewer sees these as context, never as an automatic judgment.",
};

/** Human description of one stored signal, e.g. "Pasted into the editor (1,240 characters)". */
export function describeIntegritySignal(type: IntegritySignalType, payload: unknown): string {
  const label = INTEGRITY_SIGNAL_LABEL[type];
  if (type === "PASTE" && payload && typeof payload === "object" && "length" in payload) {
    const length = Number((payload as { length: unknown }).length);
    if (Number.isFinite(length)) {
      return `${label} (${length.toLocaleString()} character${length === 1 ? "" : "s"})`;
    }
  }
  return label;
}
