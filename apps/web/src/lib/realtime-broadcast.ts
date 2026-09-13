import "server-only";

import type { InternalBroadcast } from "@interviewhub/types";

/**
 * Tells every socket in an interview room that something changed, through
 * apps/realtime's /internal/broadcast hook. Best-effort: the change is already
 * committed, so a missed broadcast means someone refreshes to see it, not that
 * anything is lost. Never throws.
 */
export async function broadcastToRoom(payload: InternalBroadcast): Promise<void> {
  const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_URL;
  const secret = process.env.REALTIME_JWT_SECRET;
  if (!realtimeUrl || !secret) return;

  try {
    await fetch(`${realtimeUrl}/internal/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error(`[realtime-broadcast] ${payload.type ?? "execution"} broadcast failed`, err);
  }
}
