import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstApplication = vi.fn();
const createAuditLog = vi.fn();
const consumeRateLimit = vi.fn();
const releaseRateLimit = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    application: { findFirst: (...args: unknown[]) => findFirstApplication(...args) },
    auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
  },
}));

// The limiter's own atomicity is covered in rate-limit.test.ts; here it only
// matters what polishResume asks of it and when.
class FakeRateLimitError extends Error {}
vi.mock("./rate-limit", () => ({
  RateLimitError: FakeRateLimitError,
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
  releaseRateLimit: (...args: unknown[]) => releaseRateLimit(...args),
}));

const generateContent = vi.fn();

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

// Force GEMINI_API_KEY to be set so the module creates a client.
vi.stubEnv("GEMINI_API_KEY", "test-key");

const { polishResume, PolishError } = await import("./resume-polish.js");

const APP_ID = "app_1";
const CANDIDATE_ID = "candidate_1";

const APPLICATION_DATA = {
  id: APP_ID,
  job: {
    orgId: "org_1",
    title: "Software Engineer",
    description: "Build web apps",
    requiredSkills: ["React", "TypeScript"],
  },
  resumes: [
    {
      parsedText: "Experienced developer with React skills",
      atsReports: [
        { suggestions: [{ category: "keyword", message: "Add TypeScript" }], missingKeywords: ["TypeScript"] },
      ],
    },
  ],
};

beforeEach(() => {
  findFirstApplication.mockReset();
  createAuditLog.mockReset();
  consumeRateLimit.mockReset();
  releaseRateLimit.mockReset();
  generateContent.mockReset();

  findFirstApplication.mockResolvedValue(APPLICATION_DATA);
  createAuditLog.mockResolvedValue({});
  consumeRateLimit.mockResolvedValue({ hitId: "hit_1", remaining: 2 });
  releaseRateLimit.mockResolvedValue(undefined);
});

describe("polishResume", () => {
  test("application not owned by candidate -> rejected", async () => {
    findFirstApplication.mockResolvedValue(null);

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow(PolishError);
    expect(findFirstApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: APP_ID, candidateId: CANDIDATE_ID },
      }),
    );
  });

  test("no parsed resume text -> rejected", async () => {
    findFirstApplication.mockResolvedValue({
      ...APPLICATION_DATA,
      resumes: [{ parsedText: null, atsReports: [] }],
    });

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow(/parsed resume/i);
  });

  test("rate limit exceeded -> rejected without calling Gemini", async () => {
    consumeRateLimit.mockRejectedValue(new FakeRateLimitError("limit"));

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow(/all 3 polish attempts/i);
    expect(consumeRateLimit).toHaveBeenCalledWith({ key: `polish:${APP_ID}`, limit: 3 });
    expect(generateContent).not.toHaveBeenCalled();
  });

  test("valid request: calls Gemini and returns validated response", async () => {
    const polishResponse = {
      suggestions: [
        {
          section: "Summary",
          original: "Experienced developer",
          suggestion: "Results-driven software engineer with 5+ years building React applications",
          reason: "More specific and quantified",
        },
      ],
      summary: "Good foundation but needs more quantified achievements.",
    };

    generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(polishResponse) },
    });

    const result = await polishResume(APP_ID, CANDIDATE_ID);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].section).toBe("Summary");
    expect(result.summary).toContain("quantified");
    expect(releaseRateLimit).not.toHaveBeenCalled();
    // The regression: this used to write orgId "system", which is no
    // organization at all, so the insert failed and was silently swallowed.
    expect(createAuditLog).toHaveBeenCalledWith({
      data: {
        orgId: "org_1",
        action: "resume.polished",
        target: APP_ID,
        actorId: CANDIDATE_ID,
      },
    });
  });

  test("Gemini failure hands the attempt back", async () => {
    generateContent.mockRejectedValue(new Error("503 from Gemini"));

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow(/503/);
    expect(releaseRateLimit).toHaveBeenCalledWith("hit_1");
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("malformed Gemini output hands the attempt back", async () => {
    generateContent.mockResolvedValue({ response: { text: () => "not json" } });

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow();
    expect(releaseRateLimit).toHaveBeenCalledWith("hit_1");
  });
});
