import "server-only";

import { prisma } from "@interviewhub/db";
import { usableCalendarsFor, type UsableCalendar } from "./calendar-accounts";
import {
  deleteEvent,
  fetchFreeBusy,
  insertEvent,
  isAuthFailure,
  patchEvent,
  type CalendarEventInput,
} from "./google-calendar";
import { inviteUid, type InviteKind } from "./interview-notices";
import type { BusyInterval } from "./scheduling";

/**
 * Keeps each participant's own Google Calendar in step with the interview
 * (PRD FR-5.3), and reads back when they are busy so the scheduling grid can
 * account for meetings this app never booked.
 *
 * Runs beside the .ics email in lib/interview-notices.ts rather than instead
 * of it: the .ics is what reaches everyone, connected or not, and the event
 * written here is what a connected user's calendar shows without them having
 * to accept anything.
 */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function loadSyncContext(interviewId: string) {
  return prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      roomName: true,
      scheduledAt: true,
      durationMins: true,
      application: {
        select: {
          candidate: { select: { name: true } },
          job: { select: { title: true } },
        },
      },
      participants: { select: { userId: true } },
      calendarEvents: { select: { id: true, calendarAccountId: true, externalId: true } },
    },
  });
}

type SyncContext = NonNullable<Awaited<ReturnType<typeof loadSyncContext>>>;

function eventFor(context: SyncContext): CalendarEventInput {
  const joinUrl = `${appUrl()}/interview/${context.id}`;
  return {
    summary: `Interview: ${context.application.candidate.name} — ${context.application.job.title}`,
    description: `Join the interview room: ${joinUrl}`,
    location: joinUrl,
    start: context.scheduledAt,
    durationMins: context.durationMins,
    // The same UID the .ics carries. A client that holds both the emailed
    // invite and this event then treats them as one meeting instead of
    // showing the interview twice.
    iCalUID: inviteUid(context.roomName),
  };
}

/**
 * Writes one interview to one person's calendar, creating or moving the event
 * as needed.
 *
 * Never throws: a calendar that can't be reached must not fail the scheduling
 * action that triggered this, the same contract sendInterviewInvites keeps.
 */
async function syncOne(
  context: SyncContext,
  calendar: UsableCalendar,
  kind: InviteKind,
): Promise<void> {
  const existing = context.calendarEvents.find(
    (event) => event.calendarAccountId === calendar.accountId,
  );
  const event = eventFor(context);

  try {
    if (kind === "cancelled") {
      if (!existing) return;
      await deleteEvent(calendar.accessToken, calendar.calendarId, existing.externalId);
      await prisma.calendarEvent.delete({ where: { id: existing.id } });
      return;
    }

    if (existing) {
      await patchEvent(calendar.accessToken, calendar.calendarId, existing.externalId, event);
      return;
    }

    const externalId = await insertEvent(calendar.accessToken, calendar.calendarId, event);
    // upsert, not create: two syncs racing on the same interview (a reschedule
    // landing on top of the scheduling notice) would otherwise collide on
    // @@unique([interviewId, calendarAccountId]) and lose the second event id.
    await prisma.calendarEvent.upsert({
      where: {
        interviewId_calendarAccountId: {
          interviewId: context.id,
          calendarAccountId: calendar.accountId,
        },
      },
      create: { interviewId: context.id, calendarAccountId: calendar.accountId, externalId },
      update: { externalId },
    });
  } catch (err) {
    if (isAuthFailure(err)) {
      // The grant went away between usableCalendarsFor and this call. Drop the
      // account so the settings page stops claiming a live connection.
      console.error(`[calendar-sync] grant lost for user ${calendar.userId}; disconnecting`, err);
      await prisma.calendarAccount
        .delete({ where: { id: calendar.accountId } })
        .catch(() => undefined);
      return;
    }
    console.error(
      `[calendar-sync] ${kind} sync failed for interview ${context.id}, user ${calendar.userId}`,
      err,
    );
  }
}

/**
 * Pushes an interview to every participant who has connected a calendar.
 *
 * Call it after the change it reflects has committed, for the same reason
 * sendInterviewInvites is called that way: it reads the interview's current
 * state rather than being told what changed.
 */
export async function syncInterviewToCalendars(
  interviewId: string,
  kind: InviteKind,
): Promise<void> {
  try {
    const context = await loadSyncContext(interviewId);
    if (!context) return;

    const calendars = await usableCalendarsFor(context.participants.map((p) => p.userId));
    if (calendars.length === 0) return;

    await Promise.all(calendars.map((calendar) => syncOne(context, calendar, kind)));
  } catch (err) {
    console.error(`[calendar-sync] ${kind} sync failed for interview ${interviewId}`, err);
  }
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * When each of `userIds` is busy on their own Google Calendar between `from`
 * and `to`, shaped exactly like the interview bookings in lib/scheduling.ts so
 * the scheduling grid can treat the two alike.
 *
 * Advisory, and deliberately not part of findInterviewerConflict: that check
 * refuses a booking outright, and someone's private calendar is the wrong
 * thing to give a hard veto to. An interviewer with a lunch blocked out can
 * still be booked over on purpose — the grid marks the slot, the recruiter
 * decides.
 *
 * Never throws, and returns nothing at all when Google is unreachable: a
 * scheduling grid that shows only the interviews this app knows about is the
 * behaviour without this feature, and the right thing to degrade to.
 */
export async function getGoogleBusy(
  userIds: string[],
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  try {
    const calendars = await usableCalendarsFor(userIds);
    if (calendars.length === 0) return [];

    const perCalendar = await Promise.all(
      calendars.map(async (calendar) => {
        try {
          const slots = await fetchFreeBusy(
            calendar.accessToken,
            calendar.calendarId,
            from,
            to,
          );
          return slots.map((slot) => ({
            interviewerId: calendar.userId,
            start: slot.start,
            end: slot.end,
          }));
        } catch (err) {
          console.error(`[calendar-sync] free/busy failed for user ${calendar.userId}`, err);
          return [];
        }
      }),
    );

    return perCalendar.flat();
  } catch (err) {
    console.error("[calendar-sync] free/busy lookup failed", err);
    return [];
  }
}
