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
    return new Response(null, { status: 401 });
  }

  const result = await sendDueReminders();
  return Response.json(result);
}
