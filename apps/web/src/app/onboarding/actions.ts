"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DASHBOARD_PATH, isRole, isSelfAssignableRole } from "@/lib/roles";

/**
 * Assigns the caller's own role during onboarding.
 *
 * Server Actions are directly invocable regardless of what the UI renders, so
 * every restriction the onboarding screen implies has to be enforced here:
 *   - only self-assignable roles (never ADMIN), and
 *   - only while the account has no role yet, so this cannot be replayed later
 *     to escalate from CANDIDATE to RECRUITER.
 */
export async function setRole(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const role = formData.get("role");
  if (!isSelfAssignableRole(role)) {
    throw new Error("Invalid role submitted");
  }

  const client = await clerkClient();

  // Read the role from Clerk rather than from session claims: the session
  // token is a snapshot and can lag behind a role assigned moments ago,
  // which would let a repeat submission overwrite it.
  const user = await client.users.getUser(userId);
  const existingRole = user.publicMetadata?.role;
  if (isRole(existingRole)) {
    redirect(DASHBOARD_PATH[existingRole]);
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role },
  });

  redirect(DASHBOARD_PATH[role]);
}
