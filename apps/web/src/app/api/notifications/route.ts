import { auth } from "@clerk/nextjs/server";
import { prisma } from "@interviewhub/db";
import { NextResponse } from "next/server";
import {
  getUnreadNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/lib/notifications";

/**
 * GET /api/notifications — returns unread notifications + count for the
 * signed-in user. The bell component polls this.
 */
export async function GET() {
  const user = await resolveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [notifications, count] = await Promise.all([
    getUnreadNotifications(user.id),
    getUnreadCount(user.id),
  ]);

  return NextResponse.json({ notifications, count });
}

/**
 * POST /api/notifications — marks notifications as read.
 *
 * Body: { ids: string[] } to mark specific ones, or { all: true } for all.
 */
export async function POST(request: Request) {
  const user = await resolveUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A malformed body used to throw here, which surfaced as a 500 — the bell
  // sends JSON, so anything else is a bad request, not a server fault.
  let body: { all?: boolean; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body: { all: true } or { ids: [...] }" }, { status: 400 });
  }

  if (body.all === true) {
    await markAllNotificationsRead(user.id);
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    // Ids are scoped to this user in the query, so a forged id changes nothing.
    await markNotificationsRead(user.id, body.ids.filter((id): id is string => typeof id === "string"));
  }

  return NextResponse.json({ ok: true });
}

async function resolveUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } });
}
