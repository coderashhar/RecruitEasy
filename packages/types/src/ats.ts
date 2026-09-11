import { z } from "zod";

export const atsSourceSchema = z.enum(["LLM", "HEURISTIC"]);
export type AtsSource = z.infer<typeof atsSourceSchema>;

// Shape the LLM is asked to return via structured output; also the shape
// the heuristic fallback must produce, so the UI never has to branch on it.
export const atsReportSchema = z.object({
  score: z.number().int().min(0).max(100),
  missingKeywords: z.array(z.string()),
  skillsMatch: z.object({
    matched: z.array(z.string()),
    partial: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  suggestions: z.array(
    z.object({
      category: z.enum(["grammar", "impact", "formatting", "keyword"]),
      message: z.string(),
    }),
  ),
});
export type AtsReportPayload = z.infer<typeof atsReportSchema>;

export const polishSuggestionSchema = z.object({
  section: z.string(),
  original: z.string(),
  suggestion: z.string(),
  reason: z.string(),
});

export const polishResponseSchema = z.object({
  suggestions: z.array(polishSuggestionSchema),
  summary: z.string(),
});
export type PolishResponse = z.infer<typeof polishResponseSchema>;
