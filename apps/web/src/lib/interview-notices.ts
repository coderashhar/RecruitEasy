import "server-only";

import { prisma } from "@interviewhub/db";
import { emailFromAddress } from "./email";
import { interviewNoticeEmail, type InterviewNoticeKind } from "./email-templates";
import { buildIcs, parseMailbox } from "./ics";
import { notifyUser } from "./notifications";

export type InviteKind = Extract<InterviewNoticeKind, "scheduled" | "rescheduled" | "cancelled">;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Stable for the life of the interview: calendar clients match updates and
 * cancellations to the event they already hold by UID. roomName rather than
 * the database id, for the same reason LiveKit is given it — it already
 * exists as the interview's external identifier.
 */
export function inviteUid(roomName: string): string {
  return `${roomName}@interviewhub`;
}

async function loadNoticeContext(interviewId: string) {
  return prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      id: true,
      roomName: true,
      scheduledAt: true,
      durationMins: true,
      icsSequence: true,
      application: {
        select: {
          candidate: { select: { name: true } },
          job: { select: { title: true } },
        },
      },
      participants: {
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

type NoticeContext = NonNullable<Awaited<ReturnType<typeof loadNoticeContext>>>;

function notifyParticipants(
  context: NoticeContext,
  kind: InterviewNoticeKind,
  options: { calendar?: "REQUEST" | "CANCEL"; startsIn?: string } = {},
) {
  const joinUrl = `${appUrl()}/interview/${context.id}`;
  const jobTitle = context.application.job.title;
  const candidateName = context.application.candidate.name;

  // One invite listing every participant, attached to each person's email,
  // so everyone's calendar holds the same event with the same attendee list.
  const ics = options.calendar
    ? buildIcs({
        uid: inviteUid(context.roomName),
        sequence: context.icsSequence,
        method: options.calendar,
        start: context.scheduledAt,
        durationMins: context.durationMins,
        summary: `Interview: ${candidateName} — ${jobTitle}`,
        description: `Join the interview room: ${joinUrl}`,
        url: joinUrl,
        organizer: parseMailbox(emailFromAddress()),
        attendees: context.participants.map(({ user }) => ({ name: user.name, email: user.email })),
      })
    : null;

  return Promise.all(
    context.participants.map(({ role, user }) => {
      const content = interviewNoticeEmail({
        kind,
        recipientName: user.name,
        recipientIsCandidate: role === "CANDIDATE",
        candidateName,
        jobTitle,
        scheduledAt: context.scheduledAt,
        durationMins: context.durationMins,
        joinUrl,
        startsIn: options.startsIn,
      });

      return notifyUser(user.id, {
        type: `interview.${kind}`,
        title: content.subject,
        body: content.text.split("\n\n")[1] ?? content.subject,
        link: kind === "cancelled" ? undefined : `/interview/${context.id}`,
        email: {
          to: user.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          attachments: ics
            ? [
                {
                  filename: "invite.ics",
                  content: ics,
                  contentType: `text/calendar; charset=utf-8; method=${options.calendar}`,
                },
              ]
            : undefined,
        },
      });
    }),
  );
}

/**
 * Emails and in-app notifies every participant — candidate, interviewers and
 * observers — with a calendar invite attached. Reads the interview's current
 * state, so call it after the change it announces has committed.
 *
 * Never throws: like notifyUser, a failed notice must not fail the scheduling
 * action that triggered it.
 */
export async function sendInterviewInvites(interviewId: string, kind: InviteKind): Promise<void> {
  try {
    const context = await loadNoticeContext(interviewId);
    if (!context) return;
    await notifyParticipants(context, kind, {
      calendar: kind === "cancelled" ? "CANCEL" : "REQUEST",
    });
  } catch (err) {
    console.error(`[interview-notices] ${kind} notice failed for interview ${interviewId}`, err);
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "in 55 minutes", "in 24 hours" — for the subject and body of a reminder. */
export function formatStartsIn(msUntil: number): string {
  if (msUntil < 90 * MINUTE) {
    const minutes = Math.max(1, Math.round(msUntil / MINUTE));
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.round(msUntil / HOUR);
  return `in ${hours} hours`;
}

export type ReminderSlot = "24h" | "1h";

/**
 * Which reminder, if any, an upcoming interview is due at `now`.
 *
 * - Within the last hour before the start: the 1-hour reminder.
 * - Within the 24 hours before that: the day-ahead reminder — but only for an
 *   interview booked well before it. One booked (or moved) less than a day
 *   out already got its invite moments ago; a "tomorrow" reminder on top of
 *   that is noise. `updatedAt` stands in for "when the invite went out": for
 *   a SCHEDULED interview the only writes are scheduling, rescheduling and
 *   these reminder claims, and a claim can't have happened before the 24h one.
 *
 * A reminder whose window has passed is never sent late: an interview first
 * seen 30 minutes out gets the 1-hour reminder, not a day-ahead one.
 */
export function dueReminder(
  interview: {
    scheduledAt: Date;
    updatedAt: Date;
    reminder24hSentAt: Date | null;
    reminder1hSentAt: Date | null;
  },
  now: Date,
): ReminderSlot | null {
  const msUntil = interview.scheduledAt.getTime() - now.getTime();
  if (msUntil <= 0 || msUntil > 24 * HOUR) return null;

  if (msUntil <= HOUR) {
    return interview.reminder1hSentAt ? null : "1h";
  }

  const bookedAhead = interview.scheduledAt.getTime() - interview.updatedAt.getTime();
  if (interview.reminder24hSentAt || bookedAhead < 25 * HOUR) return null;
  return "24h";
}

/**
 * One sweep of the reminder job: emails and notifies every participant of each
 * interview with a reminder due. Safe to run as often as the trigger likes and
 * to overlap with itself — each reminder is claimed with a conditional update
 * before anything is sent, and only the run whose update matched sends it.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const upcoming = await prisma.interview.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) },
      OR: [{ reminder24hSentAt: null }, { reminder1hSentAt: null }],
    },
    select: {
      id: true,
      scheduledAt: true,
      updatedAt: true,
      reminder24hSentAt: true,
      reminder1hSentAt: true,
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });

  let sent = 0;

  for (const interview of upcoming) {
    const slot = dueReminder(interview, now);
    if (!slot) continue;

    const field = slot === "1h" ? "reminder1hSentAt" : "reminder24hSentAt";

    // Pinning status and scheduledAt too means a reschedule or cancellation
    // landing between the read above and this claim makes it match nothing,
    // rather than reminding people about a time that no longer stands.
    const { count } = await prisma.interview.updateMany({
      where: {
        id: interview.id,
        status: "SCHEDULED",
        scheduledAt: interview.scheduledAt,
        [field]: null,
      },
      data: { [field]: now },
    });
    if (count !== 1) continue;

    try {
      const context = await loadNoticeContext(interview.id);
      if (!context) continue;
      await notifyParticipants(context, "reminder", {
        startsIn: formatStartsIn(interview.scheduledAt.getTime() - now.getTime()),
      });
      sent += 1;
    } catch (err) {
      // Claimed but not delivered: logged, not retried. Re-sending on the next
      // sweep risks a second copy to everyone the first attempt did reach.
      console.error(`[interview-notices] ${slot} reminder failed for interview ${interview.id}`, err);
    }
  }

  return { sent };
}
