import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runRetention } from "@/lib/retention";

export const dynamic = "force-dynamic";

/** Retention sweep: expired recordings and stale rate-limit counters. See lib/retention.ts. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return Response.json(
      { error: "Unauthorized. Send `Authorization: Bearer <CRON_SECRET>`; requests are refused when CRON_SECRET is unset." },
      { status: 401 },
    );
  }
  return Response.json(await runRetention());
}
