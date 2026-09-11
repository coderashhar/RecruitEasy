import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createAtsReport = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    atsReport: {
      create: (...args: unknown[]) => createAtsReport(...args),
    },
  },
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () =>
              JSON.stringify({
                score: 78,
                missingKeywords: ["kubernetes"],
                skillsMatch: {
                  matched: ["TypeScript", "PostgreSQL"],
                  partial: ["Docker"],
                  missing: ["Kubernetes"],
                },
                suggestions: [
                  { category: "keyword", message: "Add Kubernetes experience if applicable." },
                ],
              }),
          },
        }),
      };
    }
  },
}));

// Must set before import so the module creates a Gemini instance.
vi.stubEnv("GEMINI_API_KEY", "test-key");

const { scoreResume, scoreWithHeuristic } = await import("./ats-scoring.js");

beforeEach(() => {
  createAtsReport.mockReset();
  createAtsReport.mockResolvedValue({ id: "report_1" });
});

// ---------------------------------------------------------------------------
// scoreResume (integration — Gemini mock)
// ---------------------------------------------------------------------------

describe("scoreResume", () => {
  test("persists an LLM-sourced ATS report", async () => {
    await scoreResume(
      "resume_1",
      "Experienced TypeScript developer with PostgreSQL.",
      "Build scalable services with TypeScript and Kubernetes.",
      ["TypeScript", "PostgreSQL", "Kubernetes"],
    );

    expect(createAtsReport).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resumeId: "resume_1",
        score: 78,
        source: "LLM",
        model: expect.any(String),
      }),
    });
  });

  test("does not throw when DB write fails", async () => {
    createAtsReport.mockRejectedValue(new Error("DB down"));

    await expect(
      scoreResume("resume_1", "text", "desc", ["skill"]),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// scoreWithHeuristic
// ---------------------------------------------------------------------------

describe("scoreWithHeuristic", () => {
  test("returns a valid AtsReportPayload shape", () => {
    const result = scoreWithHeuristic(
      "Experienced TypeScript and React developer with PostgreSQL database expertise.",
      "We need a TypeScript developer with PostgreSQL and Docker experience.",
      ["TypeScript", "PostgreSQL", "Docker"],
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.skillsMatch.matched).toContain("TypeScript");
    expect(result.skillsMatch.matched).toContain("PostgreSQL");
    expect(result.skillsMatch.missing).toContain("Docker");
    expect(result.missingKeywords).toEqual(expect.any(Array));
    expect(result.suggestions).toEqual(expect.any(Array));
  });

  test("scores higher when more skills match", () => {
    const highMatch = scoreWithHeuristic(
      "TypeScript PostgreSQL Docker Kubernetes React",
      "We need TypeScript, PostgreSQL, Docker, Kubernetes, React.",
      ["TypeScript", "PostgreSQL", "Docker", "Kubernetes", "React"],
    );
    const lowMatch = scoreWithHeuristic(
      "I like cooking and gardening.",
      "We need TypeScript, PostgreSQL, Docker, Kubernetes, React.",
      ["TypeScript", "PostgreSQL", "Docker", "Kubernetes", "React"],
    );

    expect(highMatch.score).toBeGreaterThan(lowMatch.score);
  });

  test("clamps score to 0-100 range", () => {
    const result = scoreWithHeuristic("", "", []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test("suggests adding missing skills", () => {
    const result = scoreWithHeuristic(
      "I know JavaScript.",
      "We need TypeScript and Docker.",
      ["TypeScript", "Docker"],
    );

    const keywordSuggestion = result.suggestions.find(
      (suggestion) => suggestion.category === "keyword",
    );
    expect(keywordSuggestion).toBeTruthy();
    expect(keywordSuggestion!.message).toContain("TypeScript");
  });

  test("flags short resumes", () => {
    const result = scoreWithHeuristic("Short.", "Job description here.", ["skill"]);

    const impactSuggestion = result.suggestions.find(
      (suggestion) => suggestion.category === "impact",
    );
    expect(impactSuggestion).toBeTruthy();
    expect(impactSuggestion!.message).toContain("too short");
  });
});
