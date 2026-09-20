import { beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const interview = { findUnique: vi.fn() };
const calendarEvent = { upsert: vi.fn(), delete: vi.fn() };
const calendarAccount = { delete: vi.fn() };

// Forwarded through arrows: vi.mock's factory is hoisted above these consts,
// so naming one in the object literal itself is a temporal-dead-zone error.
vi.mock("@interviewhub/db", () => ({
  prisma: {
    interview: { findUnique: (...args: unknown[]) => interview.findUnique(...args) },
    calendarEvent: {
      upsert: (...args: unknown[]) => calendarEvent.upsert(...args),
      delete: (...args: unknown[]) => calendarEvent.delete(...args),
    },
    calendarAccount: { delete: (...args: unknown[]) => calendarAccount.delete(...args) },
  },
}));

const usableCalendarsFor = vi.fn();
vi.mock("./calendar-accounts", () => ({
  usableCalendarsFor: (...args: unknown[]) => usableCalendarsFor(...args),
}));

const insertEvent = vi.fn();
const patchEvent = vi.fn();
const deleteEvent = vi.fn();
const fetchFreeBusy = vi.fn();

vi.mock("./google-calendar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google-calendar")>();
  return {
    ...actual,
    insertEvent: (...args: unknown[]) => insertEvent(...args),
    patchEvent: (...args: unknown[]) => patchEvent(...args),
    deleteEvent: (...args: unknown[]) => deleteEvent(...args),
    fetchFreeBusy: (...args: unknown[]) => fetchFreeBusy(...args),
  };
});

import { getGoogleBusy, syncInterviewToCalendars } from "./calendar-sync";
import { GoogleCalendarError } from "./google-calendar";

const CALENDAR = {
  accountId: "cal_1",
  userId: "user_1",
  calendarId: "primary",
  accessToken: "access-1",
};

function interviewContext(overrides: Record<string, unknown> = {}) {
  return {
    id: "int_1",
    roomName: "interview_abc",
    scheduledAt: new Date("2026-09-24T13:00:00.000Z"),
    durationMins: 60,
    application: {
      candidate: { name: "Ada Lovelace" },
      job: { title: "Backend Engineer" },
    },
    participants: [{ userId: "user_1" }, { userId: "user_2" }],
    calendarEvents: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.NEXT_PUBLIC_APP_URL = "https://hub.example.com";
});

describe("syncInterviewToCalendars", () => {
  test("creates the event and records its id for a first sync", async () => {
    interview.findUnique.mockResolvedValue(interviewContext());
    usableCalendarsFor.mockResolvedValue([CALENDAR]);
    insertEvent.mockResolvedValue("google-event-1");

    await syncInterviewToCalendars("int_1", "scheduled");

    const [, , event] = insertEvent.mock.calls[0];
    expect(event.summary).toBe("Interview: Ada Lovelace — Backend Engineer");
    expect(event.location).toBe("https://hub.example.com/interview/int_1");
    // The same UID the .ics carries, so a client holding both sees one event.
    expect(event.iCalUID).toBe("interview_abc@interviewhub");
    expect(calendarEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { interviewId: "int_1", calendarAccountId: "cal_1", externalId: "google-event-1" },
      }),
    );
  });

  test("asks about every participant, candidate and observers included", async () => {
    interview.findUnique.mockResolvedValue(interviewContext());
    usableCalendarsFor.mockResolvedValue([]);

    await syncInterviewToCalendars("int_1", "scheduled");

    expect(usableCalendarsFor).toHaveBeenCalledWith(["user_1", "user_2"]);
  });

  test("moves the existing event on a reschedule instead of adding a second", async () => {
    interview.findUnique.mockResolvedValue(
      interviewContext({
        scheduledAt: new Date("2026-09-25T09:00:00.000Z"),
        calendarEvents: [{ id: "ce_1", calendarAccountId: "cal_1", externalId: "google-event-1" }],
      }),
    );
    usableCalendarsFor.mockResolvedValue([CALENDAR]);

    await syncInterviewToCalendars("int_1", "rescheduled");

    expect(insertEvent).not.toHaveBeenCalled();
    const [, , eventId, event] = patchEvent.mock.calls[0];
    expect(eventId).toBe("google-event-1");
    expect(event.start.toISOString()).toBe("2026-09-25T09:00:00.000Z");
  });

  test("creates the event on a reschedule for someone who connected since", async () => {
    // Their calendar has no copy to move, so this is still an insert.
    interview.findUnique.mockResolvedValue(
      interviewContext({
        calendarEvents: [{ id: "ce_1", calendarAccountId: "cal_other", externalId: "e-other" }],
      }),
    );
    usableCalendarsFor.mockResolvedValue([CALENDAR]);
    insertEvent.mockResolvedValue("google-event-2");

    await syncInterviewToCalendars("int_1", "rescheduled");

    expect(patchEvent).not.toHaveBeenCalled();
    expect(insertEvent).toHaveBeenCalled();
  });

  test("removes the event and its row on a cancellation", async () => {
    interview.findUnique.mockResolvedValue(
      interviewContext({
        calendarEvents: [{ id: "ce_1", calendarAccountId: "cal_1", externalId: "google-event-1" }],
      }),
    );
    usableCalendarsFor.mockResolvedValue([CALENDAR]);

    await syncInterviewToCalendars("int_1", "cancelled");

    expect(deleteEvent).toHaveBeenCalledWith("access-1", "primary", "google-event-1");
    expect(calendarEvent.delete).toHaveBeenCalledWith({ where: { id: "ce_1" } });
  });

  test("a cancellation with nothing on the calendar does nothing", async () => {
    interview.findUnique.mockResolvedValue(interviewContext());
    usableCalendarsFor.mockResolvedValue([CALENDAR]);

    await syncInterviewToCalendars("int_1", "cancelled");

    expect(deleteEvent).not.toHaveBeenCalled();
    expect(calendarEvent.delete).not.toHaveBeenCalled();
  });

  test("a lost grant disconnects that account and leaves the others alone", async () => {
    interview.findUnique.mockResolvedValue(interviewContext());
    usableCalendarsFor.mockResolvedValue([
      CALENDAR,
      { ...CALENDAR, accountId: "cal_2", userId: "user_2" },
    ]);
    insertEvent
      .mockRejectedValueOnce(new GoogleCalendarError("forbidden", 403))
      .mockResolvedValueOnce("google-event-2");
    calendarAccount.delete.mockResolvedValue({});

    await syncInterviewToCalendars("int_1", "scheduled");

    expect(calendarAccount.delete).toHaveBeenCalledWith({ where: { id: "cal_1" } });
    expect(calendarEvent.upsert).toHaveBeenCalledTimes(1);
  });

  test("a Google outage is logged, not thrown — scheduling must not fail on it", async () => {
    interview.findUnique.mockResolvedValue(interviewContext());
    usableCalendarsFor.mockResolvedValue([CALENDAR]);
    insertEvent.mockRejectedValue(new GoogleCalendarError("unavailable", 503));

    await expect(syncInterviewToCalendars("int_1", "scheduled")).resolves.toBeUndefined();
    // 503 is transient: the account stays connected.
    expect(calendarAccount.delete).not.toHaveBeenCalled();
  });

  test("an interview that no longer exists is a no-op", async () => {
    interview.findUnique.mockResolvedValue(null);
    await expect(syncInterviewToCalendars("gone", "scheduled")).resolves.toBeUndefined();
    expect(usableCalendarsFor).not.toHaveBeenCalled();
  });

  test("a database failure never escapes", async () => {
    interview.findUnique.mockRejectedValue(new Error("connection lost"));
    await expect(syncInterviewToCalendars("int_1", "scheduled")).resolves.toBeUndefined();
  });
});

describe("getGoogleBusy", () => {
  const FROM = new Date("2026-09-21T00:00:00.000Z");
  const TO = new Date("2026-09-28T00:00:00.000Z");

  test("labels each interval with the user it belongs to", async () => {
    usableCalendarsFor.mockResolvedValue([CALENDAR]);
    fetchFreeBusy.mockResolvedValue([
      { start: "2026-09-24T09:00:00Z", end: "2026-09-24T10:00:00Z" },
    ]);

    // Same shape as an interview booking, so the grid treats the two alike.
    expect(await getGoogleBusy(["user_1"], FROM, TO)).toEqual([
      { interviewerId: "user_1", start: "2026-09-24T09:00:00Z", end: "2026-09-24T10:00:00Z" },
    ]);
  });

  test("one unreachable calendar doesn't lose the others", async () => {
    usableCalendarsFor.mockResolvedValue([
      CALENDAR,
      { ...CALENDAR, accountId: "cal_2", userId: "user_2" },
    ]);
    fetchFreeBusy
      .mockRejectedValueOnce(new GoogleCalendarError("unavailable", 503))
      .mockResolvedValueOnce([{ start: "2026-09-24T11:00:00Z", end: "2026-09-24T12:00:00Z" }]);

    const busy = await getGoogleBusy(["user_1", "user_2"], FROM, TO);

    expect(busy).toEqual([
      { interviewerId: "user_2", start: "2026-09-24T11:00:00Z", end: "2026-09-24T12:00:00Z" },
    ]);
  });

  test("is empty when nobody has connected a calendar", async () => {
    usableCalendarsFor.mockResolvedValue([]);
    expect(await getGoogleBusy(["user_1"], FROM, TO)).toEqual([]);
    expect(fetchFreeBusy).not.toHaveBeenCalled();
  });

  test("degrades to nothing rather than failing the scheduling grid", async () => {
    usableCalendarsFor.mockRejectedValue(new Error("connection lost"));
    expect(await getGoogleBusy(["user_1"], FROM, TO)).toEqual([]);
  });
});
