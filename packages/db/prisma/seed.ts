/**
 * Seeds enough data to build and test the Phase 1 dashboards against a real
 * database, without needing a live Clerk account for every persona.
 *
 * The seeded users have placeholder `clerkId`s (`seed_*`) — they exist so
 * foreign keys resolve and dashboard queries have something to render, but
 * they cannot sign in through Clerk. Signing in still requires a real
 * account per README.md; nothing here substitutes for that.
 *
 * Idempotent: safe to re-run (`npm run db:seed`) — clears seeded rows first.
 */
import { prisma } from "../src/index.js";

async function main() {
  // Children first, respecting FKs; organizations cascade the rest anyway,
  // but explicit order keeps this readable and correct if cascades change.
  await prisma.auditLog.deleteMany();
  await prisma.integritySignal.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.execution.deleteMany();
  await prisma.codeDocument.deleteMany();
  await prisma.interviewParticipant.deleteMany();
  await prisma.interview.deleteMany();
  await prisma.atsReport.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "Acme Hiring", slug: "acme-hiring" },
  });

  const [recruiter, interviewer, admin, alice, bob, carol] = await Promise.all([
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_recruiter",
        role: "RECRUITER",
        email: "recruiter@acme.test",
        name: "Rae Recruiter",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_interviewer",
        role: "INTERVIEWER",
        email: "interviewer@acme.test",
        name: "Ivan Interviewer",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_admin",
        role: "ADMIN",
        email: "admin@acme.test",
        name: "Ada Admin",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_candidate_alice",
        role: "CANDIDATE",
        email: "alice@candidate.test",
        name: "Alice Applicant",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_candidate_bob",
        role: "CANDIDATE",
        email: "bob@candidate.test",
        name: "Bob Applicant",
      },
    }),
    prisma.user.create({
      data: {
        orgId: org.id,
        clerkId: "seed_candidate_carol",
        role: "CANDIDATE",
        email: "carol@candidate.test",
        name: "Carol Applicant",
      },
    }),
  ]);

  const [backendJob, frontendJob] = await Promise.all([
    prisma.job.create({
      data: {
        orgId: org.id,
        title: "Backend Engineer",
        description: "Build and scale the interview execution pipeline.",
        requiredSkills: ["TypeScript", "PostgreSQL", "Docker"],
      },
    }),
    prisma.job.create({
      data: {
        orgId: org.id,
        title: "Frontend Engineer",
        description: "Own the collaborative interview room UI.",
        requiredSkills: ["React", "TypeScript", "WebRTC"],
      },
    }),
  ]);

  // Applications span the pipeline so the recruiter dashboard has more than
  // one column to render.
  const [aliceApp, bobApp, carolApp] = await Promise.all([
    prisma.application.create({
      data: { jobId: backendJob.id, candidateId: alice.id, status: "INTERVIEWING" },
    }),
    prisma.application.create({
      data: { jobId: backendJob.id, candidateId: bob.id, status: "SCREENING" },
    }),
    prisma.application.create({
      data: { jobId: frontendJob.id, candidateId: carol.id, status: "APPLIED" },
    }),
  ]);

  const aliceResume = await prisma.resume.create({
    data: {
      applicationId: aliceApp.id,
      uploadedById: alice.id,
      fileKey: "seed/alice-resume.pdf",
      parsedText: "Alice Applicant — 5 years backend, TypeScript, PostgreSQL, Docker.",
    },
  });

  await prisma.atsReport.create({
    data: {
      resumeId: aliceResume.id,
      score: 82,
      missingKeywords: ["Kubernetes"],
      skillsMatch: { matched: ["TypeScript", "PostgreSQL", "Docker"], partial: [], missing: ["Kubernetes"] },
      suggestions: [{ category: "keyword", message: "Mention container orchestration experience." }],
      source: "HEURISTIC",
    },
  });

  const interview = await prisma.interview.create({
    data: {
      applicationId: aliceApp.id,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      durationMins: 60,
      status: "SCHEDULED",
      roomName: `interview_${aliceApp.id}`,
      participants: {
        create: [
          { userId: alice.id, role: "CANDIDATE" },
          { userId: interviewer.id, role: "INTERVIEWER" },
        ],
      },
    },
  });

  console.log(`Seeded org "${org.slug}" — ${6} users, 2 jobs, 3 applications, 1 interview.`);
  console.log(`  interview.id = ${interview.id}`);
  console.log(`  application ids: alice=${aliceApp.id} bob=${bobApp.id} carol=${carolApp.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
