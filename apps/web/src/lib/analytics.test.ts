import { describe, test, expect, vi, beforeEach } from "vitest";

const groupByInterview = vi.fn();
const groupByApplication = vi.fn();
const findManyApplication = vi.fn();
const findManyAuditLog = vi.fn();
const findManyJob = vi.fn();
const findManyParticipant = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    interview: { groupBy: (...args: unknown[]) => groupByInterview(...args) },
    application: {
      groupBy: (...args: unknown[]) => groupByApplication(...args),
      findMany: (...args: unknown[]) => findManyApplication(...args),
    },
    auditLog: { findMany: (...args: unknown[]) => findManyAuditLog(...args) },
    job: { findMany: (...args: unknown[]) => findManyJob(...args) },
    interviewParticipant: { findMany: (...args: unknown[]) => findManyParticipant(...args) },
  },
}));

const { weekStart, bucketByWeek, completionRate, parseRange, getOrgAnalytics } = await import(
  "./analytics.js"
);

beforeEach(() => {
  for (const mock of [groupByInterview, groupByApplication, findManyApplication, findManyAuditLog, findManyJob, findManyParticipant]) {
    mock.mockReset().mockResolvedValue([]);
  }
});

describe("weekStart", () => {
  test("is the Monday at 00:00 UTC of that week", () => {
    expect(weekStart(new Date("2026-09-13T23:00:00Z")).toISOString()).toBe("2026-09-07T00:00:00.000Z"); // Sunday
    expect(weekStart(new Date("2026-09-14T00:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z"); // Monday
  });
});

describe("bucketByWeek", () => {
  test("every week in range is present, empty weeks included", () => {
    const buckets = bucketByWeek(
      [new Date("2026-08-18T10:00:00Z"), new Date("2026-08-19T10:00:00Z"), new Date("2026-09-02T10:00:00Z")],
      new Date("2026-08-17T00:00:00Z"),
      new Date("2026-09-03T00:00:00Z"),
    );

    expect(buckets.map((bucket) => [bucket.week.toISOString().slice(0, 10), bucket.count])).toEqual([
      ["2026-08-17", 2],
      ["2026-08-24", 0],
      ["2026-08-31", 1],
    ]);
  });
});

describe("completionRate", () => {
  test("completed over interviews with a recorded outcome", () => {
    expect(completionRate({ COMPLETED: 6, NO_SHOW: 1, CANCELLED: 1 })).toBe(0.75);
  });

  // An interview nobody closed out isn't evidence of anything either way.
  test("interviews still marked scheduled or in progress don't count against it", () => {
    expect(completionRate({ COMPLETED: 3, SCHEDULED: 5, IN_PROGRESS: 2 })).toBe(1);
  });

  test("no recorded outcomes is null, not 0%", () => {
    expect(completionRate({ SCHEDULED: 4 })).toBeNull();
  });
});

describe("parseRange", () => {
  test("accepts 30 or 90 and falls back to 30", () => {
    expect(parseRange("90")).toBe(90);
    expect(parseRange("7")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("getOrgAnalytics", () => {
  const NOW = new Date("2026-09-14T12:00:00Z");

  test("every query is scoped to the org", async () => {
    await getOrgAnalytics("org_1", 30, NOW);

    const from = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(groupByInterview.mock.calls[0][0].where).toEqual({
      application: { job: { orgId: "org_1" } },
      scheduledAt: { gte: from, lt: NOW },
    });
    expect(groupByApplication.mock.calls[0][0].where).toEqual({ job: { orgId: "org_1" } });
    expect(findManyApplication.mock.calls[0][0].where).toMatchObject({ job: { orgId: "org_1" } });
    expect(findManyAuditLog.mock.calls[0][0].where).toMatchObject({ orgId: "org_1" });
    expect(findManyJob.mock.calls[0][0].where).toEqual({ orgId: "org_1" });
    expect(findManyParticipant.mock.calls[0][0].where.interview.application).toEqual({ job: { orgId: "org_1" } });
  });

  test("hires come from moves to HIRED in the audit trail", async () => {
    findManyAuditLog.mockResolvedValue([{ createdAt: new Date("2026-09-10T09:00:00Z") }]);

    const analytics = await getOrgAnalytics("org_1", 30, NOW);

    expect(findManyAuditLog.mock.calls[0][0].where).toMatchObject({
      action: "application.status_changed",
      meta: { path: ["to"], equals: "HIRED" },
    });
    expect(analytics.hires).toBe(1);
    expect(analytics.hiresPerWeek.at(-2)).toMatchObject({ count: 1 });
  });

  test("summarises interviews, pipeline, ATS by job and interviewer load", async () => {
    groupByInterview.mockResolvedValue([
      { status: "COMPLETED", _count: { _all: 3 } },
      { status: "NO_SHOW", _count: { _all: 1 } },
      { status: "SCHEDULED", _count: { _all: 2 } },
    ]);
    groupByApplication.mockResolvedValue([
      { status: "APPLIED", _count: { _all: 4 } },
      { status: "INTERVIEWING", _count: { _all: 2 } },
      { status: "HIRED", _count: { _all: 1 } },
    ]);
    findManyJob.mockResolvedValue([
      {
        id: "job_1",
        title: "Backend Engineer",
        applications: [
          { resumes: [{ atsReports: [{ score: 80 }] }] },
          { resumes: [{ atsReports: [{ score: 61 }] }] },
          { resumes: [] },
        ],
      },
    ]);
    findManyParticipant.mockResolvedValue([
      { user: { id: "u1", name: "Bob" }, interview: { status: "COMPLETED", feedback: [{ interviewerId: "u1" }] } },
      { user: { id: "u1", name: "Bob" }, interview: { status: "COMPLETED", feedback: [] } },
      { user: { id: "u2", name: "Dee" }, interview: { status: "SCHEDULED", feedback: [] } },
    ]);

    const analytics = await getOrgAnalytics("org_1", 30, NOW);

    expect(analytics.interviews).toMatchObject({ completionRate: 0.75, unrecorded: 2, total: 6 });
    expect(analytics.funnel.map((step) => step.count)).toEqual([4, 0, 2, 0, 1, 0]);
    expect(analytics.activeApplications).toBe(6);
    expect(analytics.atsByJob[0]).toEqual({
      jobId: "job_1",
      title: "Backend Engineer",
      applications: 3,
      scored: 2,
      averageScore: 71,
    });
    expect(analytics.interviewers).toEqual([
      { name: "Bob", scheduled: 2, completed: 2, feedbackGiven: 1 },
      { name: "Dee", scheduled: 1, completed: 0, feedbackGiven: 0 },
    ]);
  });
});
