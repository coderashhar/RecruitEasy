/**
 * Turns an audit row into a sentence a person can read, keeping the machine
 * name and its meta alongside for filtering and grep. Pure, so it runs on
 * either side and is testable without a database.
 */

const STATUS_WORD: Record<string, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export interface AuditSentence {
  /** Plain text pieces; `strong` pieces are the values worth scanning for. */
  parts: Array<{ text: string; strong?: boolean }>;
}

function record(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

function word(value: unknown): string {
  return typeof value === "string" ? (STATUS_WORD[value] ?? value) : String(value);
}

function plural(count: unknown, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function describeAuditAction(action: string, rawMeta: unknown): AuditSentence {
  const meta = record(rawMeta);
  const text = (value: string) => ({ text: value });
  const strong = (value: string) => ({ text: value, strong: true });

  switch (action) {
    case "application.created":
      return { parts: [text("Created an application")] };
    case "application.status_changed":
      return meta.from && meta.to
        ? { parts: [text("Moved an application from "), strong(word(meta.from)), text(" to "), strong(word(meta.to))] }
        : { parts: [text("Changed an application's status")] };
    case "application.shortlisted":
      return { parts: [text("Shortlisted an application")] };
    case "application.unshortlisted":
      return { parts: [text("Removed an application from the shortlist")] };
    case "interview.scheduled": {
      const panel = Array.isArray(meta.interviewerIds) ? meta.interviewerIds.length : null;
      const watching = Array.isArray(meta.observerIds) ? meta.observerIds.length : 0;
      return {
        parts: [
          text("Scheduled an interview"),
          ...(panel ? [text(` · ${plural(panel, "interviewer")}`)] : []),
          ...(watching > 0 ? [text(`, ${plural(watching, "observer")}`)] : []),
        ],
      };
    }
    case "interview.observer_added":
      return { parts: [text("Added an observer to an interview")] };
    case "interview.observer_removed":
      return { parts: [text("Removed an observer from an interview")] };
    case "interview.rescheduled":
      return { parts: [text("Rescheduled an interview")] };
    case "interview.status_changed":
      return meta.to
        ? { parts: [text("Marked an interview "), strong(word(meta.to))] }
        : { parts: [text("Changed an interview's status")] };
    case "feedback.submitted":
      return meta.recommendation
        ? { parts: [text("Submitted feedback · recommended "), strong(word(meta.recommendation))] }
        : { parts: [text("Submitted feedback")] };
    case "recording.started":
      return { parts: [text("Started recording an interview")] };
    case "recording.stopped":
      return { parts: [text(meta.automatic ? "Recording stopped when the room emptied" : "Stopped recording an interview")] };
    case "job.created":
      return typeof meta.title === "string"
        ? { parts: [text("Posted a job · "), strong(meta.title)] }
        : { parts: [text("Posted a job")] };
    case "resume.polished":
      return { parts: [text("Polished a résumé with AI suggestions")] };
    case "privacy.data_deleted":
      return {
        parts: [
          text("Deleted a candidate's data"),
          ...(meta.applications !== undefined
            ? [text(` · ${plural(meta.applications, "application")}, ${plural(meta.files ?? 0, "file")}`)]
            : []),
        ],
      };
    case "privacy.deletion_rejected":
      return { parts: [text("Declined a deletion request")] };
    default:
      return { parts: [text(action)] };
  }
}

/**
 * Meta as `key=value` pairs, dropping ids that only repeat the record column
 * and flattening arrays to their length.
 */
export function formatAuditMeta(rawMeta: unknown, maxLength = 160): string {
  const meta = record(rawMeta);
  const pairs = Object.entries(meta).map(([key, value]) => {
    if (Array.isArray(value)) return `${key}=${value.length}`;
    if (value && typeof value === "object") return `${key}={…}`;
    return `${key}=${String(value)}`;
  });
  const joined = pairs.join(" ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength)}…` : joined;
}
