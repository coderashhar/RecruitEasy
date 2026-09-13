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
