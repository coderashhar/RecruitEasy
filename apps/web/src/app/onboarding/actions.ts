"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { clerkProfile, provisionUser } from "@/lib/provisioning";
import { DASHBOARD_PATH, isRole, isSelfAssignableRole } from "@/lib/roles";

/**
 * Assigns the caller's own role during onboarding, and creates the database row
 * that every downstream record (applications, interviews, feedback) hangs off.
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

  const profile = clerkProfile(user);
  if (!profile) {
    throw new Error("Your account has no email address yet. Add one to your profile, then try again.");
  }

  // Database row first, Clerk metadata second. If Clerk fails after this, the
  // account still has no role, so onboarding is retried and provisionUser is a
  // no-op the second time. The reverse order is what produces the state this
  // whole change exists to eliminate: a user with a role and nothing to attach
  // an application or interview to.
  await provisionUser({ clerkId: userId, role, ...profile });

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role },
  });

  redirect(DASHBOARD_PATH[role]);
}
