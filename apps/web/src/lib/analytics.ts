import "server-only";

import { prisma, type ApplicationStatus, type InterviewStatus } from "@interviewhub/db";

const DAY = 24 * 60 * 60 * 1000;

export const ANALYTICS_RANGES = [30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseRange(raw: string | string[] | undefined): AnalyticsRange {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (ANALYTICS_RANGES as readonly number[]).includes(value) ? (value as AnalyticsRange) : 30;
}

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStart(date: Date): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY);
}

/**
 * Counts `dates` per week from the week containing `from` through the week
 * containing `to`. Every week in range is present, including empty ones — a
 * trend that skips quiet weeks reads as steadier than it was.
 */
export function bucketByWeek(dates: Date[], from: Date, to: Date): Array<{ week: Date; count: number }> {
  const buckets = new Map<number, number>();
  for (let week = weekStart(from).getTime(); week <= weekStart(to).getTime(); week += 7 * DAY) {
    buckets.set(week, 0);
  }
  for (const date of dates) {
    const key = weekStart(date).getTime();
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + 1);
  }
  return [...buckets].map(([week, count]) => ({ week: new Date(week), count }));
}

/**
 * Of interviews whose outcome is known, the share that actually happened.
 * Interviews still marked SCHEDULED or IN_PROGRESS after their slot are left
 * out (their outcome was never recorded) and reported separately instead.
 * Null when nothing has an outcome yet, rather than a misleading 0%.
 */
export function completionRate(counts: Partial<Record<InterviewStatus, number>>): number | null {
  const completed = counts.COMPLETED ?? 0;
  const decided = completed + (counts.NO_SHOW ?? 0) + (counts.CANCELLED ?? 0);
  return decided === 0 ? null : completed / decided;
}

export const FUNNEL_ORDER: ApplicationStatus[] = ["APPLIED", "SCREENING", "INTERVIEWING", "OFFER", "HIRED", "REJECTED"];

/**
 * Hiring metrics for one org over the last `range` days (FR-7.1, FR-7.2).
 * Every query filters on the org, like everything in queries.ts.
 */
export async function getOrgAnalytics(orgId: string, range: AnalyticsRange, now: Date = new Date()) {
  const from = new Date(now.getTime() - range * DAY);
  const inOrg = { job: { orgId } };

  const [interviewsByStatus, applicationsByStatus, newApplications, hireEvents, jobs, interviewerRows] =
    await Promise.all([
      prisma.interview.groupBy({
        by: ["status"],
        where: { application: inOrg, scheduledAt: { gte: from, lt: now } },
        _count: { _all: true },
      }),
      prisma.application.groupBy({
        by: ["status"],
        where: inOrg,
        _count: { _all: true },
      }),
      prisma.application.findMany({
        where: { ...inOrg, createdAt: { gte: from, lt: now } },
        select: { createdAt: true },
      }),
      // A hire is the moment someone moved an application to HIRED, which only
      // the audit trail records — Application.status says where it is now,
      // not when it got there.
      prisma.auditLog.findMany({
        where: {
          orgId,
          action: "application.status_changed",
          createdAt: { gte: from, lt: now },
          meta: { path: ["to"], equals: "HIRED" },
        },
        select: { createdAt: true },
      }),
      prisma.job.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          applications: {
            select: {
              resumes: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { atsReports: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true } } },
              },
            },
          },
        },
      }),
      prisma.interviewParticipant.findMany({
        where: {
          role: "INTERVIEWER",
          interview: { application: inOrg, scheduledAt: { gte: from, lt: now } },
        },
        select: {
          user: { select: { id: true, name: true } },
          interview: {
            select: { status: true, feedback: { select: { interviewerId: true } } },
          },
        },
      }),
    ]);

  const interviewCounts = Object.fromEntries(
    interviewsByStatus.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<InterviewStatus, number>>;

  const applicationCounts = Object.fromEntries(
    applicationsByStatus.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<ApplicationStatus, number>>;

  const atsByJob = jobs.map((job) => {
    const scores = job.applications.flatMap((application) =>
      application.resumes.flatMap((resume) => resume.atsReports.map((report) => report.score)),
    );
    return {
      jobId: job.id,
      title: job.title,
      applications: job.applications.length,
      scored: scores.length,
      averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    };
  });

  const byInterviewer = new Map<string, { name: string; scheduled: number; completed: number; feedbackGiven: number }>();
  for (const row of interviewerRows) {
    const entry = byInterviewer.get(row.user.id) ?? { name: row.user.name, scheduled: 0, completed: 0, feedbackGiven: 0 };
    entry.scheduled += 1;
    if (row.interview.status === "COMPLETED") {
      entry.completed += 1;
      if (row.interview.feedback.some((feedback) => feedback.interviewerId === row.user.id)) {
        entry.feedbackGiven += 1;
      }
    }
    byInterviewer.set(row.user.id, entry);
  }

  return {
    range,
    from,
    to: now,
    interviews: {
      counts: interviewCounts,
      completionRate: completionRate(interviewCounts),
      unrecorded: (interviewCounts.SCHEDULED ?? 0) + (interviewCounts.IN_PROGRESS ?? 0),
      total: Object.values(interviewCounts).reduce((sum, count) => sum + (count ?? 0), 0),
    },
    funnel: FUNNEL_ORDER.map((status) => ({ status, count: applicationCounts[status] ?? 0 })),
    activeApplications: FUNNEL_ORDER.filter((status) => status !== "HIRED" && status !== "REJECTED").reduce(
      (sum, status) => sum + (applicationCounts[status] ?? 0),
      0,
    ),
    hires: hireEvents.length,
    applicationsPerWeek: bucketByWeek(newApplications.map((row) => row.createdAt), from, now),
    hiresPerWeek: bucketByWeek(hireEvents.map((row) => row.createdAt), from, now),
    atsByJob,
    interviewers: [...byInterviewer.values()].sort((a, b) => b.scheduled - a.scheduled),
  };
}

export type OrgAnalytics = Awaited<ReturnType<typeof getOrgAnalytics>>;
