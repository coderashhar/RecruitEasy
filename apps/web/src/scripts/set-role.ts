/**
 * Dev convenience: assign a role to an already-signed-up Clerk user without
 * going through the /onboarding UI. Clerk doesn't offer a way to script the
 * creation of verified users, so seeding still starts with a real sign-up —
 * this script just skips re-clicking through onboarding for every test account.
 *
 * Mirrors onboarding: it writes the database row as well as the Clerk role, so
 * the shortcut produces a fully usable account rather than one that can sign in
 * but can't be added to an interview.
 *
 * Usage: npx tsx src/scripts/set-role.ts <email> <CANDIDATE|INTERVIEWER|RECRUITER|ADMIN>
 */
import { createClerkClient } from "@clerk/backend";
import { prisma } from "@interviewhub/db";
import { clerkProfile, provisionUser } from "../lib/provisioning";
import { isRole } from "../lib/roles";

async function main() {
  const [email, role] = process.argv.slice(2);

  if (!email || !isRole(role)) {
    console.error("Usage: npx tsx src/scripts/set-role.ts <email> <CANDIDATE|INTERVIEWER|RECRUITER|ADMIN>");
    process.exit(1);
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error("CLERK_SECRET_KEY is not set — copy it from the Clerk dashboard into .env.local first.");
    process.exit(1);
  }

  const clerkClient = createClerkClient({ secretKey });
  const { data: users } = await clerkClient.users.getUserList({ emailAddress: [email] });

  const user = users[0];
  if (!user) {
    console.error(`No Clerk user found for ${email} — sign up through /sign-up first.`);
    process.exit(1);
  }

  const profile = clerkProfile(user);
  if (!profile) {
    console.error(`Clerk user ${email} has no email address on record.`);
    process.exit(1);
  }

  const dbUser = await provisionUser({ clerkId: user.id, role, ...profile });
  await clerkClient.users.updateUserMetadata(user.id, { publicMetadata: { role } });

  console.log(`${email} → ${role} (users.id = ${dbUser.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
