/**
 * Turning a Clerk identity into a row in our own database.
 *
 * Clerk owns authentication and the `role` claim; Postgres owns everything the
 * product is actually about — applications, interviews, participants, feedback.
 * All of those hang off `User`, so until a Clerk account has a `users` row it
 * cannot participate in anything.
 *
 * Deliberately free of `server-only` and of `@clerk/nextjs/server`'s request-scoped
 * `auth()`: src/scripts/set-role.ts is a plain tsx script with no request context
 * and has to provision users too. Request-scoped accessors live in users.ts.
 */
import { prisma, type Organization, type User } from "@interviewhub/db";
import type { User as ClerkUser } from "@clerk/backend";
import type { Role } from "./roles";

/**
 * Every user currently lands in one shared organization. Multi-tenancy (org per
 * customer, invite flows) is a deliberate later phase — the schema already carries
 * `orgId` everywhere so that change stays a data migration, not a re-model.
 */
export const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Default Organization";

export function ensureDefaultOrg(): Promise<Organization> {
  return prisma.organization.upsert({
    where: { slug: DEFAULT_ORG_SLUG },
    update: {},
    create: { slug: DEFAULT_ORG_SLUG, name: DEFAULT_ORG_NAME },
  });
}

export interface ProvisionUserInput {
  clerkId: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Idempotent: safe to call on every onboarding submit and on every self-heal.
 *
 * Matches on `clerkId` first and falls back to `email`, because both columns are
 * unique. Deleting a Clerk account and signing up again with the same address
 * produces a new `clerkId` for the same person — an upsert keyed only on `clerkId`
 * would try to insert and trip the unique index on `email` instead. Re-pointing
 * the existing row at the new `clerkId` is the behaviour that matches intent.
 *
 * Two concurrent first-time calls can still race to insert; the loser gets a
 * unique-constraint error and the caller's next request succeeds against the row
 * the winner created.
 */
export async function provisionUser({
  clerkId,
  email,
  name,
  role,
}: ProvisionUserInput): Promise<User> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ clerkId }, { email }] },
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { clerkId, email, name, role },
    });
  }

  const org = await ensureDefaultOrg();
  return prisma.user.create({
    data: { clerkId, orgId: org.id, email, name, role },
  });
}

/**
 * Pulls the two fields our schema requires out of a Clerk profile.
 *
 * Returns null rather than inventing a placeholder when there is no email: `email`
 * is unique and non-null in the schema, so a fabricated value would collide across
 * every such account and silently merge two people into one row.
 */
export function clerkProfile(user: ClerkUser): { email: string; name: string } | null {
  const email =
    user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!email) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { email, name: name || user.username || email };
}
