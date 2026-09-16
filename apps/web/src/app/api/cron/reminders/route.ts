import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendDueReminders } from "@/lib/interview-notices";

// Never cached or prerendered: every call is a sweep against the current time.
export const dynamic = "force-dynamic";

/**
 * Sends interview reminders that have come due. Hit on a schedule — every 10
 * minutes by the `cron` service in infra/caddy/docker-compose.yml. GET because
 * that is what Vercel Cron sends, should this move there.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    // A body, not an empty 401: this route is hit by a scheduler and by
    // whoever is debugging why the scheduler stopped working, and an empty
    // page says nothing about which of the two secrets is wrong.
    return Response.json(
      { error: "Unauthorized. Send `Authorization: Bearer <CRON_SECRET>`; requests are refused when CRON_SECRET is unset." },
      { status: 401 },
    );
  }

  const result = await sendDueReminders();
  return Response.json(result);
}
