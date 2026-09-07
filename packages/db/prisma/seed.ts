/**
 * Seeds enough data to exercise the recruiter and candidate dashboards against
 * a real database, without needing a live Clerk account for every persona.
 *
 * The seeded users have placeholder `clerkId`s (`seed_*`) — they exist so
 * foreign keys resolve and dashboard queries have something to render, but
 * they cannot sign in through Clerk. Signing in still requires a real account
 * per README.md; nothing here substitutes for that.
 *
 * Two things this deliberately gets right, because the first version got both
 * wrong and the combination made the seeded data invisible:
 *
 *   1. It seeds into the `default` organization — the one
 *      `ensureDefaultOrg()` in apps/web/src/lib/provisioning.ts puts every
 *      real signup into. Seeding into an org of its own left real accounts
 *      and seeded data in different orgs, and since every query in queries.ts
 *      is org-scoped, a freshly signed-up recruiter saw an empty dashboard
 *      with no indication why.
 *
 *   2. Its deletes are scoped to seeded rows. The first version called
 *      `deleteMany()` with no filter on every table, so re-running it wiped
 *      the `users` row of anyone who had actually signed up. That was masked
 *      by getCurrentUser()'s self-heal re-provisioning them, which is why it
 *      never looked like data loss.
 */
import { prisma } from "../src/index.js";

/** Must match DEFAULT_ORG_SLUG in apps/web/src/lib/provisioning.ts. */
const DEFAULT_ORG_SLUG = "default";

/**
 * Every seeded row is created with an id under this prefix, and only rows
 * under it are ever deleted. Real rows use cuids, which can't collide with it.
 */
const SEED_PREFIX = "seed_";

const ID = {
  recruiter: `${SEED_PREFIX}user_recruiter`,
  interviewer: `${SEED_PREFIX}user_interviewer`,
  admin: `${SEED_PREFIX}user_admin`,
  alice: `${SEED_PREFIX}user_alice`,
  bob: `${SEED_PREFIX}user_bob`,
  carol: `${SEED_PREFIX}user_carol`,
  backendJob: `${SEED_PREFIX}job_backend`,
  frontendJob: `${SEED_PREFIX}job_frontend`,
  aliceApp: `${SEED_PREFIX}app_alice`,
  bobApp: `${SEED_PREFIX}app_bob`,
  carolApp: `${SEED_PREFIX}app_carol`,
  aliceResume: `${SEED_PREFIX}resume_alice`,
  aliceReport: `${SEED_PREFIX}ats_alice`,
  interview: `${SEED_PREFIX}interview_alice`,
} as const;

/**
 * Removes previously seeded rows and nothing else.
 *
 * Matches users by `clerkId` rather than by id so it also cleans up rows left
 * by the original seed, which used generated cuids.
 *
 * Order matters: `Resume.uploadedBy` and `Feedback.interviewer` are required
 * relations with no `onDelete`, so Prisma defaults them to Restrict — they
 * block deleting a seeded user until they're gone. Everything else reaches
 * these rows by cascade (job → application → interview → participants,
 * code document, executions, integrity signals).
 */
async function clearSeededRows(): Promise<void> {
  const seededUsers = await prisma.user.findMany({
    where: { clerkId: { startsWith: SEED_PREFIX } },
    select: { id: true },
  });
  const seededUserIds = seededUsers.map((user) => user.id);

  if (seededUserIds.length > 0) {
    await prisma.feedback.deleteMany({ where: { interviewerId: { in: seededUserIds } } });
    await prisma.resume.deleteMany({ where: { uploadedById: { in: seededUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
  }

  await prisma.job.deleteMany({ where: { id: { startsWith: SEED_PREFIX } } });
}

async function main() {
  await clearSeededRows();

  // Upsert, never create: real users may already have provisioned this org.
  const org = await prisma.organization.upsert({
    where: { slug: DEFAULT_ORG_SLUG },
    update: {},
    create: { slug: DEFAULT_ORG_SLUG, name: "Default Organization" },
  });

  await prisma.user.createMany({
    data: [
      { id: ID.recruiter, orgId: org.id, clerkId: `${SEED_PREFIX}recruiter`, role: "RECRUITER", email: "recruiter@acme.test", name: "Rae Recruiter" },
      { id: ID.interviewer, orgId: org.id, clerkId: `${SEED_PREFIX}interviewer`, role: "INTERVIEWER", email: "interviewer@acme.test", name: "Ivan Interviewer" },
      { id: ID.admin, orgId: org.id, clerkId: `${SEED_PREFIX}admin`, role: "ADMIN", email: "admin@acme.test", name: "Ada Admin" },
      { id: ID.alice, orgId: org.id, clerkId: `${SEED_PREFIX}candidate_alice`, role: "CANDIDATE", email: "alice@candidate.test", name: "Alice Applicant" },
      { id: ID.bob, orgId: org.id, clerkId: `${SEED_PREFIX}candidate_bob`, role: "CANDIDATE", email: "bob@candidate.test", name: "Bob Applicant" },
      { id: ID.carol, orgId: org.id, clerkId: `${SEED_PREFIX}candidate_carol`, role: "CANDIDATE", email: "carol@candidate.test", name: "Carol Applicant" },
    ],
  });

  await prisma.job.createMany({
    data: [
      {
        id: ID.backendJob,
        orgId: org.id,
        title: "Backend Engineer",
        description: "Build and scale the interview execution pipeline.",
        requiredSkills: ["TypeScript", "PostgreSQL", "Docker"],
      },
      {
        id: ID.frontendJob,
        orgId: org.id,
        title: "Frontend Engineer",
        description: "Own the collaborative interview room UI.",
        requiredSkills: ["React", "TypeScript", "WebRTC"],
      },
    ],
  });

  // Spread across the pipeline so the recruiter dashboard has more than one
  // status to render.
  await prisma.application.createMany({
    data: [
      { id: ID.aliceApp, jobId: ID.backendJob, candidateId: ID.alice, status: "INTERVIEWING" },
      { id: ID.bobApp, jobId: ID.backendJob, candidateId: ID.bob, status: "SCREENING" },
      { id: ID.carolApp, jobId: ID.frontendJob, candidateId: ID.carol, status: "APPLIED" },
    ],
  });

  await prisma.resume.create({
    data: {
      id: ID.aliceResume,
      applicationId: ID.aliceApp,
      uploadedById: ID.alice,
      fileKey: "seed/alice-resume.pdf",
      parsedText: "Alice Applicant — 5 years backend, TypeScript, PostgreSQL, Docker.",
      atsReports: {
        create: {
          id: ID.aliceReport,
          score: 82,
          missingKeywords: ["Kubernetes"],
          skillsMatch: {
            matched: ["TypeScript", "PostgreSQL", "Docker"],
            partial: [],
            missing: ["Kubernetes"],
          },
          suggestions: [
            { category: "keyword", message: "Mention container orchestration experience." },
          ],
          source: "HEURISTIC",
        },
      },
    },
  });

  await prisma.interview.create({
    data: {
      id: ID.interview,
      applicationId: ID.aliceApp,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      durationMins: 60,
      status: "SCHEDULED",
      roomName: `${SEED_PREFIX}room_alice`,
      participants: {
        create: [
          { userId: ID.alice, role: "CANDIDATE" },
          { userId: ID.interviewer, role: "INTERVIEWER" },
        ],
      },
    },
  });

  const realUsers = await prisma.user.count({
    where: { orgId: org.id, clerkId: { not: { startsWith: SEED_PREFIX } } },
  });

  console.log(`Seeded org "${org.slug}" — 6 users, 2 jobs, 3 applications, 1 interview.`);
  console.log(`  ${realUsers} real account(s) already in this org share the data.`);
  console.log(`  interview detail: /recruiter/interviews/${ID.interview}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
