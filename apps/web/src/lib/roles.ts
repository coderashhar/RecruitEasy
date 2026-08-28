/**
 * Mirrors packages/db `UserRole` enum. Kept here too (not imported from
 * @interviewhub/db) so middleware — which runs on the Edge runtime — never
 * pulls in the Prisma client.
 */
export const ROLES = ["CANDIDATE", "INTERVIEWER", "RECRUITER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/**
 * The only roles a user may assign to themselves during onboarding. ADMIN is
 * deliberately excluded — it is granted out-of-band (the set-role script or the
 * Clerk dashboard), never by a self-service request.
 */
export const SELF_ASSIGNABLE_ROLES = ["CANDIDATE", "INTERVIEWER", "RECRUITER"] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export function isSelfAssignableRole(value: unknown): value is SelfAssignableRole {
  return (
    typeof value === "string" && (SELF_ASSIGNABLE_ROLES as readonly string[]).includes(value)
  );
}

export const DASHBOARD_PATH: Record<Role, string> = {
  CANDIDATE: "/candidate",
  INTERVIEWER: "/recruiter",
  RECRUITER: "/recruiter",
  ADMIN: "/recruiter",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
