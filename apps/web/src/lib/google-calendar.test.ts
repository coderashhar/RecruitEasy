import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildEventBody,
  deleteEvent,
  fetchFreeBusy,
  GoogleCalendarError,
  insertEvent,
  isAuthFailure,
  parseFreeBusy,
  patchEvent,
} from "./google-calendar";

const EVENT = {
  summary: "Interview: Ada Lovelace — Backend Engineer",
  description: "Join the interview room: https://hub.example.com/interview/int_1",
  location: "https://hub.example.com/interview/int_1",
  start: new Date("2026-09-24T13:00:00.000Z"),
  durationMins: 60,
  iCalUID: "interview_abc@interviewhub",
};

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("buildEventBody", () => {
  test("sends UTC instants, never a zoneless wall-clock time", () => {
    const body = buildEventBody(EVENT) as {
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    };

    // The same trap as parsing a datetime-local on the server: a local time
    // with no zone is read in the reader's own, an hour or more out.
    expect(body.start).toEqual({ dateTime: "2026-09-24T13:00:00.000Z", timeZone: "UTC" });
    expect(body.end).toEqual({ dateTime: "2026-09-24T14:00:00.000Z", timeZone: "UTC" });
  });

  test("carries the iCalendar UID, so the emailed invite and this are one event", () => {
    expect(buildEventBody(EVENT).iCalUID).toBe("interview_abc@interviewhub");
  });

  test("lists no attendees, so Google doesn't email a second invitation", () => {
    expect(buildEventBody(EVENT)).not.toHaveProperty("attendees");
  });

  test("a 15-minute interview ends 15 minutes later", () => {
    const body = buildEventBody({ ...EVENT, durationMins: 15 }) as { end: { dateTime: string } };
    expect(body.end.dateTime).toBe("2026-09-24T13:15:00.000Z");
  });
});

describe("insertEvent", () => {
  test("returns the new event id", async () => {
    const fetchMock = stubFetch({ json: async () => ({ id: "google-event-1" }) });

    expect(await insertEvent("access-1", "primary", EVENT)).toBe("google-event-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer access-1");
  });

  test("escapes a calendar id that is an email address", async () => {
    const fetchMock = stubFetch({ json: async () => ({ id: "e1" }) });
    await insertEvent("access-1", "someone@example.com", EVENT);
    expect(fetchMock.mock.calls[0][0]).toContain("someone%40example.com");
  });

  test("throws when Google answers without an id", async () => {
    stubFetch({ json: async () => ({}) });
    await expect(insertEvent("access-1", "primary", EVENT)).rejects.toThrow(GoogleCalendarError);
  });

  test("carries the HTTP status, so callers can tell a lost grant from an outage", async () => {
    stubFetch({ ok: false, status: 401 });
    await expect(insertEvent("access-1", "primary", EVENT)).rejects.toMatchObject({ status: 401 });
  });
});

describe("patchEvent", () => {
  test("patches rather than replaces, and drops the immutable UID", async () => {
    const fetchMock = stubFetch({ json: async () => ({ id: "google-event-1" }) });

    await patchEvent("access-1", "primary", "google-event-1", EVENT);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(url).toContain("/events/google-event-1");
    // Google rejects a patch that carries iCalUID, and PUT would wipe whatever
    // the owner added to their own copy of the event.
    expect(JSON.parse(init.body)).not.toHaveProperty("iCalUID");
    expect(JSON.parse(init.body).start.dateTime).toBe("2026-09-24T13:00:00.000Z");
  });
});

describe("deleteEvent", () => {
  test("accepts 204", async () => {
    stubFetch({ status: 204 });
    await expect(deleteEvent("access-1", "primary", "e1")).resolves.toBeUndefined();
  });

  test("treats 410 as done — the event was already gone", async () => {
    stubFetch({ ok: false, status: 410 });
    await expect(deleteEvent("access-1", "primary", "e1")).resolves.toBeUndefined();
  });

  test("still throws on a real failure", async () => {
    stubFetch({ ok: false, status: 500 });
    await expect(deleteEvent("access-1", "primary", "e1")).rejects.toThrow(GoogleCalendarError);
  });
});

describe("isAuthFailure", () => {
  test("is true only for 401 and 403", () => {
    expect(isAuthFailure(new GoogleCalendarError("x", 401))).toBe(true);
    expect(isAuthFailure(new GoogleCalendarError("x", 403))).toBe(true);
    expect(isAuthFailure(new GoogleCalendarError("x", 503))).toBe(false);
    expect(isAuthFailure(new Error("network"))).toBe(false);
  });
});

describe("parseFreeBusy", () => {
  test("pulls out the busy intervals for the calendar asked about", () => {
    const payload = {
      calendars: {
        primary: {
          busy: [{ start: "2026-09-24T09:00:00Z", end: "2026-09-24T10:00:00Z" }],
        },
      },
    };
    expect(parseFreeBusy(payload, "primary")).toEqual([
      { start: "2026-09-24T09:00:00Z", end: "2026-09-24T10:00:00Z" },
    ]);
  });

  test("a calendar Google reported an error for yields nothing, not a throw", () => {
    // freeBusy answers 200 with a per-calendar `errors` array when it can't
    // read one, so a successful HTTP status doesn't mean there is an answer.
    const payload = {
      calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } },
    };
    expect(parseFreeBusy(payload, "primary")).toEqual([]);
  });

  test("ignores malformed entries rather than letting them reach the grid", () => {
    const payload = {
      calendars: {
        primary: { busy: [{ start: "2026-09-24T09:00:00Z" }, null, { start: 1, end: 2 }] },
      },
    };
    expect(parseFreeBusy(payload, "primary")).toEqual([]);
  });

  test("is empty for a missing calendar or an unreadable payload", () => {
    expect(parseFreeBusy({ calendars: {} }, "primary")).toEqual([]);
    expect(parseFreeBusy(null, "primary")).toEqual([]);
    expect(parseFreeBusy({ calendars: null }, "primary")).toEqual([]);
  });
});

describe("fetchFreeBusy", () => {
  test("asks only for the window and the one calendar", async () => {
    const fetchMock = stubFetch({
      json: async () => ({ calendars: { primary: { busy: [] } } }),
    });

    await fetchFreeBusy(
      "access-1",
      "primary",
      new Date("2026-09-21T00:00:00.000Z"),
      new Date("2026-09-28T00:00:00.000Z"),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
    expect(JSON.parse(init.body)).toEqual({
      timeMin: "2026-09-21T00:00:00.000Z",
      timeMax: "2026-09-28T00:00:00.000Z",
      items: [{ id: "primary" }],
    });
  });
});
