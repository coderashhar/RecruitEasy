// Pure: no I/O, no "server-only" import, so it is unit-testable in isolation.
// Builds a single-event iCalendar invite (RFC 5545 + iTIP / RFC 5546) of the
// kind Gmail, Outlook and Apple Calendar all recognise as an invitation.

export type IcsMethod = "REQUEST" | "CANCEL";

export interface IcsPerson {
  name: string;
  email: string;
}

export interface IcsEventInput {
  /**
   * Stable across every update of the same interview. A calendar client
   * matches an update or cancellation to the event it already holds by UID,
   * so a changing UID would add a second event instead of moving the first.
   */
  uid: string;
  /** Must increase on every reschedule and on cancellation — see Interview.icsSequence. */
  sequence: number;
  method: IcsMethod;
  start: Date;
  durationMins: number;
  summary: string;
  description: string;
  url: string;
  organizer: IcsPerson;
  attendees: IcsPerson[];
  /** DTSTAMP. Injected so output is deterministic under test. */
  now?: Date;
}

/**
 * Always UTC ("Z" form). A zoneless local time would be read in whatever zone
 * the recipient's calendar is in — the same trap as parsing a datetime-local
 * value on the server — and a TZID needs a VTIMEZONE block to be valid.
 * UTC is exact for everyone, and every client displays it in local time.
 */
function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Quoted parameter values may not contain DQUOTE at all; drop it. */
function quoteParam(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

/**
 * Lines longer than 75 octets must be folded: CRLF plus one leading space
 * (RFC 5545 §3.1). Measured in UTF-8 bytes, not characters, and never split
 * inside a multi-byte character — a candidate named "José" must not produce
 * an invalid byte sequence.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    // The first line has 75 octets available; continuations lose one to the space.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

export function buildIcs(event: IcsEventInput): string {
  const end = new Date(event.start.getTime() + event.durationMins * 60_000);
  const cancelled = event.method === "CANCEL";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InterviewHub AI//Interviews//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${formatUtc(event.now ?? new Date())}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(cancelled ? `Cancelled: ${event.summary}` : event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `URL:${event.url}`,
    `LOCATION:${escapeText(event.url)}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${quoteParam(event.organizer.name)}:mailto:${event.organizer.email}`,
    ...event.attendees.map(
      (attendee) =>
        `ATTENDEE;CN=${quoteParam(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendee.email}`,
    ),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Splits an RFC 5322 "Name <address>" string such as EMAIL_FROM into its parts.
 * A bare address is returned as its own name.
 */
export function parseMailbox(mailbox: string): IcsPerson {
  const match = mailbox.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const email = match[2].trim();
    return { name: match[1].trim() || email, email };
  }
  const email = mailbox.trim();
  return { name: email, email };
}
