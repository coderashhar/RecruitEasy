import "server-only";

import { prisma, type Prisma } from "@interviewhub/db";
import { INTERVIEWER_CAPABLE_ROLES } from "@interviewhub/types";
import { currentLookbackStart, isCurrentInterview } from "./interview-timing";
import { INTEGRITY_SIGNALS_SHOWN, summarizeIntegritySignals, type IntegritySignalSummary } from "./integrity";

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

// ---------------------------------------------------------------------------
// Current vs past
//
// "Current" is isCurrentInterview in interview-timing.ts: IN_PROGRESS, or
// SCHEDULED and not yet past its slot plus the grace period. SQL here can't add
// durationMins to scheduledAt, so each query below fetches a superset and
// makes the exact cut in JS. The two supersets overlap only in the recent
// SCHEDULED rows, and the cut sends each of those to exactly one side.
// ---------------------------------------------------------------------------

/** Every current interview, plus SCHEDULED ones that may have just gone past. */
function currentSuperset(now: Date): Prisma.InterviewWhereInput[] {
  return [
    { status: "IN_PROGRESS" },
    { status: "SCHEDULED", scheduledAt: { gte: currentLookbackStart(now) } },
  ];
}

/** Every past interview, plus SCHEDULED ones that started but may still be current. */
function pastSuperset(now: Date): Prisma.InterviewWhereInput {
  return {
    status: { not: "IN_PROGRESS" },
    OR: [{ status: { not: "SCHEDULED" } }, { scheduledAt: { lt: now } }],
  };
}

/** Counts current interviews. Fetches the few superset rows rather than trusting count(). */
async function countCurrent(where: Prisma.InterviewWhereInput, now: Date): Promise<number> {
  const rows = await prisma.interview.findMany({
    where: { ...where, OR: currentSuperset(now) },
    select: { status: true, scheduledAt: true, durationMins: true },
  });
  return rows.filter((row) => isCurrentInterview(row, now)).length;
}

export async function getUpcomingInterviews(orgId: string) {
  const now = new Date();
  const rows = await prisma.interview.findMany({
    where: { application: { job: { orgId } }, OR: currentSuperset(now) },
    orderBy: { scheduledAt: "asc" },
    include: {
      application: {
        include: { candidate: { select: { id: true, name: true } }, job: true },
      },
      participants: { include: { user: { select: { id: true, name: true, role: true } } } },
    },
  });
  return rows.filter((row) => isCurrentInterview(row, now));
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
      where: { participants: { some: { userId } }, OR: currentSuperset(now) },
      orderBy: { scheduledAt: "asc" },
      include: {
        application: { include: { job: true } },
        participants: { where: { role: "INTERVIEWER" }, include: { user: { select: { name: true } } } },
      },
    }),
    // The complement of the list above, after the cut below: reached a
    // terminal state, or its slot and grace period passed with nothing
    // recorded. An interview that has started but not yet been marked in
    // progress stays in "Upcoming" — the only card carrying a link into the
    // room — until then, so a candidate a few minutes late can still join.
    prisma.interview.findMany({
      where: { participants: { some: { userId } }, ...pastSuperset(now) },
      orderBy: { scheduledAt: "desc" },
      include: { application: { include: { job: true } } },
    }),
  ]);

  return {
    applications,
    upcomingInterviews: upcomingInterviews.filter((interview) => isCurrentInterview(interview, now)),
    pastInterviews: pastInterviews.filter((interview) => !isCurrentInterview(interview, now)),
  };
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
      // Only the rows the page lists. Totals come from getIntegritySignalSummary,
      // so an interview with thousands of signals doesn't load them all.
      integritySignals: { orderBy: { occurredAt: "asc" }, take: INTEGRITY_SIGNALS_SHOWN },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true } } },
      },
      feedback: {
        orderBy: { createdAt: "desc" },
        include: { interviewer: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * Per-type signal counts for one interview, counted in the database. Scoped
 * through the interview to the org, like getInterviewDetail, so the two can
 * run in parallel off the same URL id without either trusting it.
 */
export async function getIntegritySignalSummary(
  orgId: string,
  interviewId: string,
): Promise<IntegritySignalSummary> {
  const rows = await prisma.integritySignal.groupBy({
    by: ["type"],
    where: { interviewId, interview: { application: { job: { orgId } } } },
    _count: { _all: true },
  });
  return summarizeIntegritySignals(rows.map((row) => ({ type: row.type, count: row._count._all })));
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

const ACTIVE_APPLICATION: Prisma.ApplicationWhereInput = { status: { notIn: ["HIRED", "REJECTED"] } };

/**
 * The small numbers beside sidebar items. Each is the count of a list one
 * click away, so every query mirrors the page it points at.
 */
export async function getNavCounts(user: { id: string; orgId: string }, role: string) {
  const now = new Date();

  if (role === "CANDIDATE") {
    const [applications, upcomingInterviews] = await Promise.all([
      prisma.application.count({ where: { candidateId: user.id } }),
      countCurrent({ participants: { some: { userId: user.id } } }, now),
    ]);
    return { applications, upcomingInterviews };
  }

  if (role === "INTERVIEWER") {
    const [upcomingInterviews, feedbackDue] = await Promise.all([
      countCurrent(
        {
          application: { job: { orgId: user.orgId } },
          // Any participant row, as on the My interviews page this count points at —
          // an interviewer added as an observer sees that interview there too.
          participants: { some: { userId: user.id } },
        },
        now,
      ),
      prisma.interview.count({ where: feedbackDueWhere(user) }),
    ]);
    return { upcomingInterviews, feedbackDue };
  }

  const [activeApplications, upcomingInterviews, pendingDeletions] = await Promise.all([
    prisma.application.count({ where: { job: { orgId: user.orgId }, ...ACTIVE_APPLICATION } }),
    countCurrent({ application: { job: { orgId: user.orgId } } }, now),
    role === "ADMIN"
      ? prisma.dataDeletionRequest.count({ where: { orgId: user.orgId, status: "PENDING" } })
      : Promise.resolve(0),
  ]);
  return { activeApplications, upcomingInterviews, pendingDeletions };
}

/**
 * Completed interviews this person sat in as an interviewer and has not yet
 * written feedback for — the debt that blocks a panel from deciding.
 */
function feedbackDueWhere(user: { id: string; orgId: string }) {
  return {
    application: { job: { orgId: user.orgId } },
    status: "COMPLETED" as const,
    participants: { some: { userId: user.id, role: "INTERVIEWER" as const } },
    feedback: { none: { interviewerId: user.id } },
  };
}

export async function getFeedbackDue(user: { id: string; orgId: string }) {
  return prisma.interview.findMany({
    where: feedbackDueWhere(user),
    orderBy: { scheduledAt: "asc" },
    include: {
      application: {
        include: { candidate: { select: { id: true, name: true } }, job: { select: { title: true } } },
      },
    },
  });
}

/** An interviewer's own upcoming and live interviews, soonest first. */
export async function getInterviewerSchedule(user: { id: string; orgId: string }) {
  const now = new Date();
  const rows = await prisma.interview.findMany({
    where: {
      application: { job: { orgId: user.orgId } },
      participants: { some: { userId: user.id, role: "INTERVIEWER" } },
      OR: currentSuperset(now),
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      application: {
        include: { candidate: { select: { id: true, name: true } }, job: { select: { title: true } } },
      },
    },
  });
  return rows.filter((row) => isCurrentInterview(row, now));
}

/**
 * Every interview in the org, or only the ones `participantId` sits in on:
 * upcoming and live first, then the most recent past ones.
 */
export async function getInterviewList(orgId: string, participantId?: string) {
  const now = new Date();
  const scope = {
    application: { job: { orgId } },
    ...(participantId && { participants: { some: { userId: participantId } } }),
  };
  const include = {
    application: {
      include: { candidate: { select: { id: true, name: true } }, job: { select: { title: true } } },
    },
    participants: {
      where: { role: "INTERVIEWER" as const },
      include: { user: { select: { id: true, name: true } } },
    },
  };

  const [upcoming, past] = await Promise.all([
    prisma.interview.findMany({
      where: { ...scope, OR: currentSuperset(now) },
      orderBy: { scheduledAt: "asc" },
      include,
    }),
    // take applies before the cut, so the handful of still-current rows at the
    // head of this list can leave it a little short of 50. Harmless for a
    // history list, and cheaper than an unbounded read.
    prisma.interview.findMany({
      where: { ...scope, ...pastSuperset(now) },
      orderBy: { scheduledAt: "desc" },
      take: 50,
      include,
    }),
  ]);
  return {
    upcoming: upcoming.filter((interview) => isCurrentInterview(interview, now)),
    past: past.filter((interview) => !isCurrentInterview(interview, now)),
  };
}

/** The org's jobs with how many applications each holds, and how many are still open. */
export async function getJobsWithCounts(orgId: string) {
  const jobs = await prisma.job.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { applications: true } },
      applications: { where: ACTIVE_APPLICATION, select: { id: true } },
    },
  });
  return jobs.map(({ applications, ...job }) => ({ ...job, activeApplications: applications.length }));
}

/** Name of the caller's own organisation, for the sidebar's identity line. */
export async function getOrganizationName(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  return org?.name ?? null;
}

/** Recordings still held about a candidate, for the "your data" summary. */
export async function countCandidateRecordings(candidateId: string) {
  return prisma.recording.count({
    where: { interview: { application: { candidateId } }, status: { not: "EXPIRED" } },
  });
}
