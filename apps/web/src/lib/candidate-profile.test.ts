import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstApplication = vi.fn();
const findManyApplication = vi.fn();
const findFirstResume = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    application: {
      findFirst: (...args: unknown[]) => findFirstApplication(...args),
      findMany: (...args: unknown[]) => findManyApplication(...args),
    },
    resume: { findFirst: (...args: unknown[]) => findFirstResume(...args) },
  },
}));

const { summarizeFeedback, getApplicationProfile, getLatestResumeKey, parseCompareIds, getComparison } = await import(
  "./candidate-profile.js"
);

beforeEach(() => {
  findFirstApplication.mockReset();
  findFirstResume.mockReset();
  findManyApplication.mockReset();
});

describe("summarizeFeedback", () => {
  test("averages each criterion across every interviewer and round, and tallies recommendations", () => {
    const summary = summarizeFeedback([
      { rubricScores: { coding: 4, problemSolving: 3, communication: 5 }, recommendation: "YES" },
      { rubricScores: { coding: 5, problemSolving: 4, communication: 4 }, recommendation: "STRONG_YES" },
      { rubricScores: { coding: 2, problemSolving: 2, communication: 3 }, recommendation: "YES" },
    ]);

    expect(summary.count).toBe(3);
    expect(summary.averages).toEqual({ coding: 3.7, problemSolving: 3, communication: 4 });
    expect(summary.recommendations).toEqual({ STRONG_YES: 1, YES: 2, NO: 0, STRONG_NO: 0 });
  });

  // rubricScores is a Json column: a malformed row must not drag an average to zero.
  test("a missing or non-numeric score is left out of that criterion only", () => {
    const summary = summarizeFeedback([
      { rubricScores: { coding: 4, problemSolving: "n/a" }, recommendation: "NO" },
      { rubricScores: { coding: 2, problemSolving: 5, communication: 3 }, recommendation: "NO" },
    ]);

    expect(summary.averages).toEqual({ coding: 3, problemSolving: 5, communication: 3 });
  });

  test("no feedback: null averages rather than zeros", () => {
    expect(summarizeFeedback([]).averages).toEqual({
      coding: null,
      problemSolving: null,
      communication: null,
    });
  });
});

describe("org scoping", () => {
  test("the profile query filters on the caller's org, and a miss is null", async () => {
    findFirstApplication.mockResolvedValue(null);

    await expect(getApplicationProfile("org_1", "app_other_org")).resolves.toBeNull();
    expect(findFirstApplication).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_other_org", job: { orgId: "org_1" } } }),
    );
  });

  test("the resume lookup filters on the caller's org too", async () => {
    findFirstResume.mockResolvedValue(null);

    await expect(getLatestResumeKey("org_1", "app_1")).resolves.toBeNull();
    expect(findFirstResume).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { applicationId: "app_1", application: { job: { orgId: "org_1" } } },
      }),
    );
  });
});

describe("parseCompareIds", () => {
  test("splits, trims and de-duplicates", () => {
    expect(parseCompareIds(" a, b ,a,,c")).toEqual(["a", "b", "c"]);
    expect(parseCompareIds(["a,b", "c"])).toEqual(["a", "b", "c"]);
  });

  test("fewer than 2 or more than 4 distinct ids is not a comparison", () => {
    expect(parseCompareIds(undefined)).toBeNull();
    expect(parseCompareIds("a,a")).toBeNull();
    expect(parseCompareIds("a,b,c,d,e")).toBeNull();
  });
});

function applicationRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "INTERVIEWING",
    shortlistedAt: null,
    candidate: { id: `cand_${id}`, name: `Candidate ${id}` },
    job: { id: "job_1", title: "Backend Engineer" },
    resumes: [
      {
        atsReports: [
          { score: 72, skillsMatch: { matched: ["Go"], partial: [], missing: ["SQL"] } },
        ],
      },
    ],
    interviews: [
      {
        status: "COMPLETED",
        feedback: [{ rubricScores: { coding: 4, problemSolving: 4, communication: 3 }, recommendation: "YES" }],
        _count: { integritySignals: 2 },
      },
      { status: "SCHEDULED", feedback: [], _count: { integritySignals: 0 } },
    ],
    ...overrides,
  };
}

describe("getComparison", () => {
  // Dropping the foreign id would still reveal which guessed ids exist.
  test("any id outside the org fails the whole comparison", async () => {
    findManyApplication.mockResolvedValue([applicationRow("a")]);

    await expect(getComparison("org_1", ["a", "b_other_org"])).resolves.toBeNull();
    expect(findManyApplication).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["a", "b_other_org"] }, job: { orgId: "org_1" } } }),
    );
  });

  test("columns come back in the requested order, summarised", async () => {
    findManyApplication.mockResolvedValue([applicationRow("b"), applicationRow("a", { shortlistedAt: new Date() })]);

    const columns = await getComparison("org_1", ["a", "b"]);

    expect(columns?.map((column) => column.applicationId)).toEqual(["a", "b"]);
    expect(columns?.[0]).toMatchObject({
      shortlisted: true,
      atsScore: 72,
      matchedSkills: ["Go"],
      missingSkills: ["SQL"],
      roundsCompleted: 1,
      roundsTotal: 2,
      integritySignals: 2,
    });
    expect(columns?.[0].feedback.averages).toEqual({ coding: 4, problemSolving: 4, communication: 3 });
  });
});
