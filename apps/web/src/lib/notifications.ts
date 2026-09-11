import "server-only";

import { prisma } from "@interviewhub/db";
import { sendEmail } from "./email";

export interface NotifyUserOptions {
  type: string;
  title: string;
  body: string;
  link?: string;
  /** When set, also sends an email to this address. */
  email?: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  };
}

/**
 * Creates an in-app notification and optionally sends an email.
 *
 * Never throws — a failed notification must not break the action that
 * triggered it. Both the DB write and the email send are best-effort;
 * the caller's transaction has already committed by the time this runs.
 */
export async function notifyUser(
  userId: string,
  options: NotifyUserOptions,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: options.type,
        title: options.title,
        body: options.body,
        link: options.link,
      },
    });
  } catch (err) {
    console.error("[notifications] Failed to create notification row:", err);
  }

  if (options.email) {
    await sendEmail({
      to: options.email.to,
      subject: options.email.subject,
      text: options.email.text,
      html: options.email.html,
    });
  }
}

/**
 * Returns unread notifications for a user, most recent first.
 */
export async function getUnreadNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Returns total unread count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

/**
 * Marks specific notifications as read.
 */
export async function markNotificationsRead(
  userId: string,
  notificationIds: string[],
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: { in: notificationIds }, userId },
    data: { readAt: new Date() },
  });
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
