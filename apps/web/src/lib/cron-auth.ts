import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Checks `Authorization: Bearer <CRON_SECRET>` — the header Vercel Cron sends,
 * and what the VPS trigger in infra/caddy sends too.
 *
 * Cron routes are public to the auth middleware (a scheduler has no Clerk
 * session), so this is their only gate. With CRON_SECRET unset every request
 * is refused, rather than every request being let through.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
