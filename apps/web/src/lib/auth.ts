import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isRole, type Role } from "./roles";

/**
 * Resource-based auth check for a layout/page, called in addition to
 * middleware.ts — not instead of it. Middleware only pattern-matches the
 * URL, which Clerk's own docs now flag as insufficient on its own ("can
 * diverge from how Next.js routes requests and leave protected resources
 * reachable"); this runs in the actual route being rendered.
 */
export async function requireRole(allowed: readonly Role[]) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const role = sessionClaims?.metadata?.role;
  if (!isRole(role) || !allowed.includes(role)) redirect("/onboarding");

  return { userId, role };
}
