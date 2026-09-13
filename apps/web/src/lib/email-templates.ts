import "server-only";

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Application status changes
// ---------------------------------------------------------------------------

const STATUS_TEMPLATES: Record<string, { subject: string; heading: string; body: string }> = {
  SCREENING: {
    subject: "Your application is under review",
    heading: "Application under review",
    body: "We're reviewing your application for <strong>{{jobTitle}}</strong>. We'll be in touch soon.",
  },
  INTERVIEWING: {
    subject: "You've been shortlisted!",
    heading: "Congratulations — you've been shortlisted",
    body: "We'd like to move forward with your application for <strong>{{jobTitle}}</strong>. An interview will be scheduled shortly.",
  },
  OFFER: {
    subject: "Congratulations — you've received an offer!",
    heading: "Offer extended",
    body: "We're pleased to extend an offer for <strong>{{jobTitle}}</strong>. Check the platform for details.",
  },
  HIRED: {
    subject: "Welcome aboard!",
    heading: "Welcome to the team",
    body: "Your hiring for <strong>{{jobTitle}}</strong> is confirmed. We're excited to have you join us.",
  },
  REJECTED: {
    subject: "Update on your application",
    heading: "Application update",
    body: "After careful consideration, we've decided not to proceed with your application for <strong>{{jobTitle}}</strong>. We appreciate your time and wish you the best.",
  },
};

export function applicationStatusEmail(
  candidateName: string,
  jobTitle: string,
  status: string,
): EmailContent | null {
  const template = STATUS_TEMPLATES[status];
  if (!template) return null;

  const heading = template.heading;
  const body = template.body.replace("{{jobTitle}}", jobTitle);
  const subject = template.subject;

  const html = layoutHtml(heading, `<p>Hi ${escapeHtml(candidateName)},</p><p>${body}</p>`);
  const text = `Hi ${candidateName},\n\n${stripHtml(body)}\n`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Interview notices: invites, changes, cancellations, reminders
// ---------------------------------------------------------------------------

export type InterviewNoticeKind = "scheduled" | "rescheduled" | "cancelled" | "reminder";

export interface InterviewNoticeInput {
  kind: InterviewNoticeKind;
  recipientName: string;
  /** Candidates are told about "your interview"; interviewers, who the interview is with. */
  recipientIsCandidate: boolean;
  candidateName: string;
  jobTitle: string;
  scheduledAt: Date;
  durationMins: number;
  joinUrl: string;
  /** Only for "reminder": how far off the interview is, e.g. "in 1 hour". */
  startsIn?: string;
}

/**
 * Formatted in UTC and labelled as such. This runs on the server — UTC on
 * Vercel, whatever the machine is set to locally — which has no idea where the
 * recipient is, so an unlabelled time was silently wrong for anyone outside
 * the server's zone. The attached calendar invite carries the exact instant
 * and shows it in the recipient's own time.
 */
export function formatInterviewTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

const NOTICE_COPY: Record<InterviewNoticeKind, { subject: string; heading: string; lead: string }> = {
  scheduled: {
    subject: "Interview scheduled",
    heading: "Interview scheduled",
    lead: "has been scheduled",
  },
  rescheduled: {
    subject: "Interview rescheduled",
    heading: "Interview rescheduled",
    lead: "has been moved to a new time",
  },
  cancelled: {
    subject: "Interview cancelled",
    heading: "Interview cancelled",
    lead: "has been cancelled",
  },
  reminder: {
    subject: "Reminder: interview",
    heading: "Interview reminder",
    lead: "is coming up",
  },
};

export function interviewNoticeEmail(input: InterviewNoticeInput): EmailContent {
  const copy = NOTICE_COPY[input.kind];
  const when = formatInterviewTime(input.scheduledAt);
  const cancelled = input.kind === "cancelled";

  const about = input.recipientIsCandidate
    ? `Your interview for ${input.jobTitle}`
    : `Your interview with ${input.candidateName} for ${input.jobTitle}`;
  const aboutHtml = input.recipientIsCandidate
    ? `Your interview for <strong>${escapeHtml(input.jobTitle)}</strong>`
    : `Your interview with <strong>${escapeHtml(input.candidateName)}</strong> for <strong>${escapeHtml(input.jobTitle)}</strong>`;

  const lead =
    input.kind === "reminder" && input.startsIn ? `starts ${input.startsIn}` : copy.lead;

  const subjectPrefix =
    input.kind === "reminder" && input.startsIn
      ? `Reminder: interview ${input.startsIn}`
      : copy.subject;
  const subject = `${subjectPrefix} — ${input.jobTitle}`;

  const detailsHtml = `<ul>
       <li><strong>When:</strong> ${escapeHtml(when)}</li>
       <li><strong>Duration:</strong> ${input.durationMins} minutes</li>
     </ul>`;
  const buttonHtml = cancelled
    ? ""
    : `<p><a href="${escapeHtml(input.joinUrl)}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">Join interview</a></p>`;

  const html = layoutHtml(
    copy.heading,
    `<p>Hi ${escapeHtml(input.recipientName)},</p>
     <p>${aboutHtml} ${lead}${cancelled ? "." : ":"}</p>
     ${cancelled ? `<p>It was scheduled for ${escapeHtml(when)}.</p>` : detailsHtml}
     ${buttonHtml}`,
  );

  const text = cancelled
    ? `Hi ${input.recipientName},\n\n${about} ${lead}.\n\nIt was scheduled for ${when}.\n`
    : `Hi ${input.recipientName},\n\n${about} ${lead}:\n\nWhen: ${when}\nDuration: ${input.durationMins} minutes\n\nJoin: ${input.joinUrl}\n`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Generic notification
// ---------------------------------------------------------------------------

export function genericNotificationEmail(
  recipientName: string,
  title: string,
  body: string,
  actionUrl?: string,
  actionLabel?: string,
): EmailContent {
  const buttonHtml =
    actionUrl && actionLabel
      ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;">${escapeHtml(actionLabel)}</a></p>`
      : "";

  const html = layoutHtml(
    title,
    `<p>Hi ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p>${buttonHtml}`,
  );
  const text = `Hi ${recipientName},\n\n${body}\n${actionUrl ? `\n${actionLabel}: ${actionUrl}\n` : ""}`;

  return { subject: title, text, html };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function layoutHtml(heading: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#18181b">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
    <div style="padding:24px 32px;border-bottom:1px solid #e4e4e7">
      <strong style="font-size:16px">InterviewHub AI</strong>
    </div>
    <div style="padding:32px">
      <h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
      ${content}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a">
      You're receiving this because you have an account on InterviewHub AI.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
