import { applyEgressEvent, verifyLiveKitWebhook } from "@/lib/recording";

export const dynamic = "force-dynamic";

/**
 * LiveKit's webhook, configured in the LiveKit Cloud project settings as
 * <app origin>/api/livekit/webhook. The body is signed with the project's API
 * secret; anything that fails verification is rejected before it can touch a
 * recording.
 */
export async function POST(request: Request) {
  const body = await request.text();

  let event;
  try {
    event = await verifyLiveKitWebhook(body, request.headers.get("authorization"));
  } catch {
    return new Response(null, { status: 401 });
  }

  if (event.egressInfo) {
    await applyEgressEvent(event.event, event.egressInfo);
  }
  return new Response(null, { status: 204 });
}
