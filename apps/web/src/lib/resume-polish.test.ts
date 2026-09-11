import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstApplication = vi.fn();
const countAuditLog = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    application: { findFirst: (...args: unknown[]) => findFirstApplication(...args) },
    auditLog: {
      count: (...args: unknown[]) => countAuditLog(...args),
      create: (...args: unknown[]) => createAuditLog(...args),
    },
  },
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
  countAuditLog.mockReset();
  createAuditLog.mockReset();
  generateContent.mockReset();

  findFirstApplication.mockResolvedValue(APPLICATION_DATA);
  countAuditLog.mockResolvedValue(0);
  createAuditLog.mockResolvedValue({});
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

  test("rate limit exceeded -> rejected after 3 attempts", async () => {
    countAuditLog.mockResolvedValue(3);

    await expect(polishResume(APP_ID, CANDIDATE_ID)).rejects.toThrow(/all 3 polish attempts/i);
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
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "resume.polished",
        target: APP_ID,
        actorId: CANDIDATE_ID,
      }),
    });
  });

  test("second attempt increments count check", async () => {
    countAuditLog.mockResolvedValue(2);

    generateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            suggestions: [],
            summary: "Already well-polished.",
          }),
      },
    });

    await polishResume(APP_ID, CANDIDATE_ID);

    expect(countAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: "resume.polished", target: APP_ID },
      }),
    );
  });
});
