import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma, type User } from "@interviewhub/db";
import { requireRole } from "./auth";
import { clerkProfile, provisionUser } from "./provisioning";
import { isRole, type Role } from "./roles";

/**
 * The signed-in user's row in our database, or null if there isn't one.
 *
 * Self-healing by design. Accounts that onboarded before provisioning existed
 * hold a role in Clerk but have no `users` row, and re-running onboarding is not
 * an option for them — setRole short-circuits once a role is set. Rather than
 * leaving those accounts permanently broken, a miss here re-derives the row from
 * the Clerk profile. It also covers users created straight from the Clerk
 * dashboard, which never touches our onboarding flow at all.
 *
 * Returns null when the account has no role yet: onboarding is the right place
 * to assign one, and guessing here would hand out a role nobody chose.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const existing = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (existing) return existing;

  const role = sessionClaims?.metadata?.role;
  if (!isRole(role)) return null;

  const client = await clerkClient();
  const profile = clerkProfile(await client.users.getUser(userId));
  if (!profile) return null;

  return provisionUser({ clerkId: userId, role, ...profile });
}

/**
 * Route guard for anything that needs the database user, not just the Clerk
 * session — which is every page past the dashboards.
 *
 * Layers on top of requireRole() rather than duplicating its redirect rules, so
 * the "wrong role goes to its own dashboard, missing role goes to onboarding"
 * behaviour stays defined in exactly one place.
 */
export async function requireCurrentUser(allowed: readonly Role[]): Promise<{
  clerkUserId: string;
  role: Role;
  user: User;
}> {
  const { userId, role } = await requireRole(allowed);

  const user = await getCurrentUser();
  // requireRole already proved there is a session and a valid role, so a null
  // here means provisioning genuinely failed (e.g. a Clerk account with no email
  // address). Onboarding is the only screen that can put that right.
  if (!user) redirect("/onboarding");

  return { clerkUserId: userId, role, user };
}
