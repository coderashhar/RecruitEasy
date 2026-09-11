import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@interviewhub/db";
import { atsReportSchema, type AtsReportPayload } from "@interviewhub/types";

export class AtsScoringError extends Error {}

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const MODEL_NAME = "gemini-2.0-flash";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scores a resume against a job description and persists the AtsReport.
 *
 * Tries Gemini first; falls back to keyword heuristic when the API key
 * is missing or the call fails. Never throws — a failed score must not
 * break the application submission.
 */
export async function scoreResume(
  resumeId: string,
  resumeText: string,
  jobDescription: string,
  requiredSkills: string[],
): Promise<void> {
  let payload: AtsReportPayload;
  let source: "LLM" | "HEURISTIC";
  let model: string | null = null;

  try {
    if (!gemini) throw new Error("GEMINI_API_KEY not set");
    payload = await scoreWithGemini(resumeText, jobDescription, requiredSkills);
    source = "LLM";
    model = MODEL_NAME;
  } catch (err) {
    console.warn("[ats] Gemini scoring failed, falling back to heuristic:", err);
    payload = scoreWithHeuristic(resumeText, jobDescription, requiredSkills);
    source = "HEURISTIC";
  }

  try {
    await prisma.atsReport.create({
      data: {
        resumeId,
        score: payload.score,
        missingKeywords: payload.missingKeywords,
        skillsMatch: payload.skillsMatch,
        suggestions: payload.suggestions,
        source,
        model,
      },
    });
  } catch (err) {
    console.error("[ats] Failed to persist ATS report:", err);
  }
}

// ---------------------------------------------------------------------------
// Gemini scoring
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) resume scoring engine.
Analyze the candidate's resume against the job description and required skills.
Return a JSON object with exactly this shape:

{
  "score": <integer 0-100>,
  "missingKeywords": [<strings — keywords from the JD not found in the resume>],
  "skillsMatch": {
    "matched": [<skills the resume clearly demonstrates>],
    "partial": [<skills mentioned but not demonstrated with evidence>],
    "missing": [<required skills absent from the resume>]
  },
  "suggestions": [
    { "category": "grammar" | "impact" | "formatting" | "keyword", "message": "<actionable suggestion>" }
  ]
}

Scoring guidelines:
- 90-100: Near-perfect match, strong experience evidence, polished writing
- 70-89: Good match, most skills present, minor gaps
- 50-69: Partial match, several missing skills or weak evidence
- 30-49: Poor match, major gaps
- 0-29: Minimal relevance

Be specific in suggestions. Reference actual phrases from the resume when possible.
Return ONLY valid JSON, no markdown fences, no explanation.`;

async function scoreWithGemini(
  resumeText: string,
  jobDescription: string,
  requiredSkills: string[],
): Promise<AtsReportPayload> {
  const model = gemini!.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `## Job Description
${jobDescription}

## Required Skills
${requiredSkills.join(", ")}

## Resume
${resumeText}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { role: "model", parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const text = result.response.text();
  const parsed = JSON.parse(text);
  const validated = atsReportSchema.parse(parsed);

  return validated;
}

// ---------------------------------------------------------------------------
// Heuristic fallback
// ---------------------------------------------------------------------------

/**
 * Keyword-overlap scoring when Gemini is unavailable. Simple but honest —
 * it counts how many required skills appear in the resume text (case-
 * insensitive) and derives a rough score from the match ratio.
 */
export function scoreWithHeuristic(
  resumeText: string,
  jobDescription: string,
  requiredSkills: string[],
): AtsReportPayload {
  const resumeLower = resumeText.toLowerCase();
  const jdLower = jobDescription.toLowerCase();

  // Skills matching
  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of requiredSkills) {
    if (resumeLower.includes(skill.toLowerCase())) {
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  }

  // Extract JD keywords (words 4+ chars, appears in JD but not resume)
  const jdWords = new Set(
    jdLower
      .split(/\W+/)
      .filter((word) => word.length >= 4),
  );
  const resumeWords = new Set(resumeLower.split(/\W+/));
  const missingKeywords = [...jdWords]
    .filter((word) => !resumeWords.has(word))
    .slice(0, 10);

  // Score: 60% from skills match ratio, 40% from keyword overlap
  const skillRatio = requiredSkills.length > 0
    ? matched.length / requiredSkills.length
    : 0.5;
  const keywordOverlap = jdWords.size > 0
    ? 1 - missingKeywords.length / jdWords.size
    : 0.5;
  const score = Math.round(skillRatio * 60 + keywordOverlap * 40);

  const suggestions: AtsReportPayload["suggestions"] = [];

  if (missing.length > 0) {
    suggestions.push({
      category: "keyword",
      message: `Add these skills if you have experience: ${missing.join(", ")}`,
    });
  }

  if (resumeText.length < 500) {
    suggestions.push({
      category: "impact",
      message: "Resume appears too short. Add more detail about your experience and achievements.",
    });
  }

  if (missingKeywords.length > 5) {
    suggestions.push({
      category: "keyword",
      message: `Consider incorporating these terms from the job description: ${missingKeywords.slice(0, 5).join(", ")}`,
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    missingKeywords,
    skillsMatch: { matched, partial: [], missing },
    suggestions,
  };
}
