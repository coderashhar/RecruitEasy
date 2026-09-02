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
      status: "SCHEDULED",
      scheduledAt: { gte: new Date() },
      application: { job: { orgId } },
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
  const [applications, upcomingInterviews] = await Promise.all([
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
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
        participants: { some: { userId } },
      },
      orderBy: { scheduledAt: "asc" },
      include: { application: { include: { job: true } } },
    }),
  ]);

  return { applications, upcomingInterviews };
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
    },
  });
}

/** Users who may be assigned the INTERVIEWER participant role — never a CANDIDATE. */
export async function getPotentialInterviewers(orgId: string) {
  return prisma.user.findMany({
    where: { orgId, role: { in: [...INTERVIEWER_CAPABLE_ROLES] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}
