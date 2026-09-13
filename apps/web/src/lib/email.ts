import "server-only";

import { Resend } from "resend";

// Null when the key is absent — every call site guards on this so the app
// works in development without a Resend account.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "InterviewHub AI <noreply@interviewhub.dev>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  /** Plain-text body. At least one of `text` or `html` must be provided. */
  text?: string;
  /** HTML body. */
  html?: string;
  /** e.g. a calendar invite. Content is sent as-is. */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

/** The configured sender, also used as a calendar invite's ORGANIZER. */
export function emailFromAddress(): string {
  return FROM_ADDRESS;
}

/**
 * Sends a transactional email via Resend.
 *
 * Returns `true` when the email was accepted by Resend, `false` when the
 * API key is missing (development) or Resend rejected it. Never throws —
 * a failed email must not break the action that triggered it.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!resend) {
    console.info("[email] RESEND_API_KEY not set — skipping email:", options.subject);
    return false;
  }

  try {
    // Resend's overloaded send() signature requires exactly one of text/html/react.
    // Building the object conditionally and asserting avoids passing `undefined`
    // for the fields not in use, which would mismatch the union.
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: options.to,
      subject: options.subject,
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      ...(options.html ? { html: options.html } : { text: options.text ?? "" }),
    });

    if (error) {
      console.error("[email] Resend rejected email:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] Failed to send email:", err);
    return false;
  }
}
