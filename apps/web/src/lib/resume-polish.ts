import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@interviewhub/db";
import { polishResponseSchema, type PolishResponse } from "@interviewhub/types";
import { consumeRateLimit, RateLimitError, releaseRateLimit } from "./rate-limit";

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
 * Capped at MAX_POLISH_ATTEMPTS per application for its lifetime. An attempt
 * is spent before Gemini is called (so parallel requests cannot all slip in)
 * and handed back if the call fails, so a Gemini outage costs nothing.
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
      job: { select: { orgId: true, description: true, requiredSkills: true, title: true } },
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

  // Checked before spending an attempt: an unconfigured deployment must not
  // burn through a candidate's allowance on calls that can never succeed.
  if (!gemini) {
    // The operator needs the specific cause; the candidate needs one plain line.
    console.warn("[polish] GEMINI_API_KEY is not set — résumé polish is unavailable");
    throw new PolishError("Polish isn't available right now. Your résumé and score are unaffected.");
  }

  let hitId: string;
  try {
    ({ hitId } = await consumeRateLimit({
      key: `polish:${applicationId}`,
      limit: MAX_POLISH_ATTEMPTS,
    }));
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new PolishError(
        `You have used all ${MAX_POLISH_ATTEMPTS} polish attempts for this application.`,
      );
    }
    throw err;
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

  let validated: PolishResponse;
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { role: "model", parts: [{ text: POLISH_PROMPT }] },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    validated = polishResponseSchema.parse(JSON.parse(result.response.text()));
  } catch (err) {
    await releaseRateLimit(hitId);
    throw err;
  }

  // A record for people, not the limiter. Logged rather than thrown on
  // failure: the candidate already has their suggestions and has spent the
  // attempt, and losing the result over a bookkeeping write would be worse.
  await prisma.auditLog
    .create({
      data: {
        orgId: application.job.orgId,
        actorId: candidateId,
        action: "resume.polished",
        target: applicationId,
      },
    })
    .catch((err) => console.error("[polish] audit log write failed", err));

  return validated;
}
