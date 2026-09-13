import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstApplication = vi.fn();
const findFirstResume = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    application: { findFirst: (...args: unknown[]) => findFirstApplication(...args) },
    resume: { findFirst: (...args: unknown[]) => findFirstResume(...args) },
  },
}));

const { summarizeFeedback, getApplicationProfile, getLatestResumeKey } = await import(
  "./candidate-profile.js"
);

beforeEach(() => {
  findFirstApplication.mockReset();
  findFirstResume.mockReset();
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
