import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@interviewhub/db";
import { polishResponseSchema, type PolishResponse } from "@interviewhub/types";

export class PolishError extends Error {}

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const MODEL_NAME = "gemini-2.0-flash";
const MAX_POLISH_ATTEMPTS = 3;

const POLISH_PROMPT = `You are a professional resume coach. Given a candidate's resume text, the job description they applied to, and the ATS feedback they already received, provide section-by-section improvement suggestions.

Return a JSON object with exactly this shape:
{
  "suggestions": [
    {
      "section": "<section name, e.g. 'Summary', 'Experience — Company X', 'Skills'>",
      "original": "<the weak phrase or section text>",
      "suggestion": "<your improved version>",
      "reason": "<why this change strengthens the resume>"
    }
  ],
  "summary": "<2-3 sentence overall assessment>"
}

Guidelines:
- Focus on action verbs, quantified achievements, and keyword alignment
- Flag vague phrases and suggest specific alternatives
- Suggest adding missing skills only if the candidate might plausibly have them
- Keep suggestions practical and immediately actionable
- Limit to 8 most impactful suggestions
- Return ONLY valid JSON, no markdown fences`;

/**
 * Generates resume polishing suggestions using Gemini.
 *
 * Rate-limited to MAX_POLISH_ATTEMPTS per application. The count is
 * tracked via a simple audit log query — no extra schema needed.
 */
export async function polishResume(
  applicationId: string,
  candidateId: string,
): Promise<PolishResponse> {
  // Verify ownership
  const application = await prisma.application.findFirst({
    where: { id: applicationId, candidateId },
    select: {
      id: true,
      job: { select: { description: true, requiredSkills: true, title: true } },
      resumes: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          parsedText: true,
          atsReports: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { suggestions: true, missingKeywords: true },
          },
        },
      },
    },
  });

  if (!application) {
    throw new PolishError("Application not found.");
  }

  const resume = application.resumes[0];
  if (!resume?.parsedText) {
    throw new PolishError("No parsed resume text available.");
  }

  // Rate limit: count existing polish audit logs for this application
  const polishCount = await prisma.auditLog.count({
    where: {
      action: "resume.polished",
      target: applicationId,
    },
  });

  if (polishCount >= MAX_POLISH_ATTEMPTS) {
    throw new PolishError(
      `You have used all ${MAX_POLISH_ATTEMPTS} polish attempts for this application.`,
    );
  }

  if (!gemini) {
    throw new PolishError("Resume polishing is not available — AI service not configured.");
  }

  const atsReport = resume.atsReports[0];
  const atsFeedback = atsReport
    ? `Missing keywords: ${(atsReport.missingKeywords as string[]).join(", ")}\nSuggestions: ${JSON.stringify(atsReport.suggestions)}`
    : "No ATS feedback available.";

  const model = gemini.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `## Job Title
${application.job.title}

## Job Description
${application.job.description}

## Required Skills
${application.job.requiredSkills.join(", ")}

## Current ATS Feedback
${atsFeedback}

## Resume Text
${resume.parsedText}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { role: "model", parts: [{ text: POLISH_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  });

  const text = result.response.text();
  const parsed = JSON.parse(text);
  const validated = polishResponseSchema.parse(parsed);

  // Track usage for rate limiting (no orgId needed — candidate action)
  await prisma.auditLog.create({
    data: {
      orgId: "system",
      actorId: candidateId,
      action: "resume.polished",
      target: applicationId,
    },
  }).catch(() => {});

  return validated;
}
