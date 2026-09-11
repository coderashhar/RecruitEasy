import "server-only";

import { prisma } from "@interviewhub/db";
import { INTERVIEWER_CAPABLE_ROLES } from "@interviewhub/types";

/**
 * Read side for both dashboards.
 *
 * Every function here takes the caller's `orgId` and filters on it — that's the
 * tenancy boundary for the whole app. None of these may ever accept an id
 * (applicationId, interviewId, ...) straight from a URL or form without also
 * checking it belongs to that org; the recruiter page passes its own session's
 * orgId in, never a client-supplied one.
 */

export async function getRecruiterPipeline(orgId: string) {
  return prisma.job.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      applications: {
        orderBy: { createdAt: "desc" },
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          resumes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { atsReports: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
        },
      },
    },
  });
}

export async function getUpcomingInterviews(orgId: string) {
  return prisma.interview.findMany({
    where: {
      application: { job: { orgId } },
      // An interview being run right now is still "current", not past — and
      // its scheduledAt is already behind us, so filtering on time alone
      // would drop it off the dashboard the moment it starts.
      OR: [
        { status: "SCHEDULED", scheduledAt: { gte: new Date() } },
        { status: "IN_PROGRESS" },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      application: {
        include: { candidate: { select: { id: true, name: true } }, job: true },
      },
      participants: { include: { user: { select: { id: true, name: true, role: true } } } },
    },
  });
}

export async function getCandidateOverview(userId: string) {
  // One timestamp for both queries: computing `new Date()` separately in each
  // leaves a sliver between them where an interview starting right now could
  // land in both lists, or in neither.
  const now = new Date();

  const [applications, upcomingInterviews, pastInterviews] = await Promise.all([
    prisma.application.findMany({
      where: { candidateId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        job: true,
        resumes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { atsReports: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
    }),
    prisma.interview.findMany({
      where: {
        participants: { some: { userId } },
        OR: [{ status: "SCHEDULED", scheduledAt: { gte: now } }, { status: "IN_PROGRESS" }],
      },
      orderBy: { scheduledAt: "asc" },
      include: { application: { include: { job: true } } },
    }),
    // The exact complement of the query above: reached a terminal state, or
    // its slot passed without ever starting. IN_PROGRESS is excluded here
    // because the upcoming query claims it — an interview being run right now
    // is not history, and showing it as such would pull it out of the
    // "Upcoming" card, the only place carrying a link into the room, at the
    // exact moment the candidate still needs to join.
    prisma.interview.findMany({
      where: {
        participants: { some: { userId } },
        status: { not: "IN_PROGRESS" },
        OR: [{ status: { not: "SCHEDULED" } }, { scheduledAt: { lt: now } }],
      },
      orderBy: { scheduledAt: "desc" },
      include: { application: { include: { job: true } } },
    }),
  ]);

  return { applications, upcomingInterviews, pastInterviews };
}

export async function getSchedulableApplications(orgId: string) {
  return prisma.application.findMany({
    where: { job: { orgId } },
    orderBy: { createdAt: "desc" },
    include: {
      candidate: { select: { id: true, name: true } },
      job: { select: { id: true, title: true } },
    },
  });
}

/** Candidates in the org — the only users who may be attached to an application. */
export async function getCandidatesInOrg(orgId: string) {
  return prisma.user.findMany({
    where: { orgId, role: "CANDIDATE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export async function getJobsInOrg(orgId: string) {
  return prisma.job.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
}

/**
 * Org-scoped, not participant-scoped: a recruiter or admin reviewing an
 * interview they did not sit in on must still get through. Contrast with
 * authorizeInterviewAccess in interview-access.ts, which gates the live room
 * itself and is deliberately participant-only — this is the review surface,
 * not the room.
 */
export async function getInterviewDetail(orgId: string, interviewId: string) {
  return prisma.interview.findFirst({
    where: { id: interviewId, application: { job: { orgId } } },
    include: {
      application: {
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          job: { select: { id: true, title: true } },
        },
      },
      participants: {
        include: { user: { select: { id: true, name: true, role: true } } },
      },
      codeDocument: true,
      integritySignals: { orderBy: { occurredAt: "asc" } },
      feedback: {
        orderBy: { createdAt: "desc" },
        include: { interviewer: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * ATS report for a candidate's application — the latest report for the
 * most recent resume, with job context for display.
 */
export async function getAtsReportForCandidate(applicationId: string, candidateId: string) {
  return prisma.application.findFirst({
    where: { id: applicationId, candidateId },
    select: {
      id: true,
      job: { select: { id: true, title: true, requiredSkills: true } },
      resumes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          atsReports: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
}

/**
 * Jobs visible to candidates — everything in the org, most recent first.
 * Includes application count so the listing can show demand signals.
 */
export async function getJobListings(orgId: string) {
  return prisma.job.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { applications: true } },
    },
  });
}

/**
 * Single job with full description, for the detail / apply page.
 */
export async function getJobDetail(orgId: string, jobId: string) {
  return prisma.job.findFirst({
    where: { id: jobId, orgId },
    include: {
      _count: { select: { applications: true } },
    },
  });
}

/**
 * Checks whether a candidate has already applied to a specific job.
 */
export async function hasApplied(jobId: string, candidateId: string): Promise<boolean> {
  const existing = await prisma.application.findUnique({
    where: { jobId_candidateId: { jobId, candidateId } },
    select: { id: true },
  });
  return existing !== null;
}

/** Users who may be assigned the INTERVIEWER participant role — never a CANDIDATE. */
export async function getPotentialInterviewers(orgId: string) {
  return prisma.user.findMany({
    where: { orgId, role: { in: [...INTERVIEWER_CAPABLE_ROLES] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}
