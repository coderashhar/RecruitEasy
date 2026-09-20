import "server-only";

/**
 * The three Google Calendar v3 endpoints this app uses, over `fetch`.
 * Transport only — who holds which token, and which interview maps to which
 * event, is lib/calendar-accounts.ts and lib/calendar-sync.ts.
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    /** Kept so callers can tell "the grant is gone" (401/403) from "try later" (5xx). */
    readonly status: number,
  ) {
    super(message);
  }
}

/** A 401/403 means the grant is gone or the scope was withdrawn — stop using the row. */
export function isAuthFailure(err: unknown): boolean {
  return err instanceof GoogleCalendarError && (err.status === 401 || err.status === 403);
}

async function callApi(
  accessToken: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<unknown> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    cache: "no-store",
  });

  // DELETE answers 204 with no body, and deleting an event that is already
  // gone answers 410 — both mean "it isn't on the calendar", which is the
  // state the caller wanted.
  if (response.status === 204 || response.status === 410) return null;

  if (!response.ok) {
    throw new GoogleCalendarError(
      `Google Calendar refused ${init.method} ${path} (HTTP ${response.status}).`,
      response.status,
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface CalendarEventInput {
  summary: string;
  description: string;
  location: string;
  start: Date;
  durationMins: number;
  /** Matches the iCalendar UID, so a client holding both sees one event, not two. */
  iCalUID?: string;
}

/**
 * The request body for an event.
 *
 * Times go out as UTC instants with `timeZone: "UTC"`, for the same reason
 * lib/ics.ts writes DTSTART in the "Z" form: a wall-clock time without a zone
 * is read in the reader's own, which is how an interview lands an hour out.
 * Google renders it in each viewer's calendar timezone from there.
 *
 * No `attendees`: every participant who has connected their own calendar gets
 * this event written directly to it, and listing them as attendees as well
 * would make Google email an invitation on top of the one lib/email.ts
 * already sent with an .ics attached — two invitations for one interview.
 */
export function buildEventBody(event: CalendarEventInput): Record<string, unknown> {
  const end = new Date(event.start.getTime() + event.durationMins * 60_000);
  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start.toISOString(), timeZone: "UTC" },
    end: { dateTime: end.toISOString(), timeZone: "UTC" },
    source: { title: "InterviewHub AI", url: event.location },
    ...(event.iCalUID ? { iCalUID: event.iCalUID } : {}),
  };
}

/** Returns the new event's id. */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEventInput,
): Promise<string> {
  const body = (await callApi(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: buildEventBody(event) },
  )) as Record<string, unknown> | null;

  const id = body?.id;
  if (typeof id !== "string") {
    throw new GoogleCalendarError("Google Calendar created an event without returning its id.", 500);
  }
  return id;
}

/**
 * Moves an event already on the calendar. PATCH, not PUT: a full replace would
 * wipe whatever the owner has since added to their copy — a reminder override,
 * a colour, a note.
 */
export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<void> {
  // iCalUID is immutable once set; sending it in a patch is rejected.
  const { iCalUID: _ignored, ...body } = buildEventBody({ ...event, iCalUID: undefined });
  void _ignored;
  await callApi(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body },
  );
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await callApi(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Free/busy
// ---------------------------------------------------------------------------

export interface FreeBusySlot {
  start: string;
  end: string;
}

/**
 * When this calendar is busy between `from` and `to`.
 *
 * freeBusy returns opaque intervals and nothing else — no titles, no
 * attendees, no locations. That is the whole reason this app asks for
 * `calendar.freebusy` rather than read access: a recruiter looking at the
 * scheduling grid learns that an interviewer is unavailable at 14:00, never
 * what they are doing at 14:00.
 */
export async function fetchFreeBusy(
  accessToken: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<FreeBusySlot[]> {
  const body = (await callApi(accessToken, "/freeBusy", {
    method: "POST",
    body: {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    },
  })) as Record<string, unknown> | null;

  return parseFreeBusy(body, calendarId);
}

/**
 * Pulls the busy list for one calendar out of a freeBusy response.
 *
 * Google reports a per-calendar `errors` array rather than an HTTP error when
 * one calendar in the batch can't be read (it was deleted, or the grant no
 * longer covers it), so a 200 does not mean there is an answer. An
 * unreadable calendar yields no intervals: the grid then shows the slot as
 * free, which is the safe direction — the server-side conflict check in
 * lib/scheduling.ts is what actually prevents a double booking.
 */
export function parseFreeBusy(payload: unknown, calendarId: string): FreeBusySlot[] {
  const calendars = (payload as Record<string, unknown> | null)?.calendars;
  if (typeof calendars !== "object" || calendars === null) return [];

  const entry = (calendars as Record<string, unknown>)[calendarId];
  if (typeof entry !== "object" || entry === null) return [];

  const busy = (entry as Record<string, unknown>).busy;
  if (!Array.isArray(busy)) return [];

  return busy.flatMap((slot) => {
    if (typeof slot !== "object" || slot === null) return [];
    const { start, end } = slot as Record<string, unknown>;
    if (typeof start !== "string" || typeof end !== "string") return [];
    return [{ start, end }];
  });
}
