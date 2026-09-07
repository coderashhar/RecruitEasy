import { z } from "zod";

export const feedbackRecommendationSchema = z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]);
export type FeedbackRecommendation = z.infer<typeof feedbackRecommendationSchema>;

const rubricScoreSchema = z.number().int().min(1).max(5);

/**
 * A fixed rubric, not an open Record<string, number>.
 *
 * `Feedback.rubricScores` is a Json column, so nothing at the database level
 * constrains its shape. Without one agreed set of keys, two interviewers can
 * score against different categories and their ratings become impossible to
 * compare or aggregate later — which is the entire point of having a rubric
 * rather than free-text notes (PRD: "standardized scoring... across
 * candidates").
 */
export const rubricScoresSchema = z.object({
  coding: rubricScoreSchema,
  problemSolving: rubricScoreSchema,
  communication: rubricScoreSchema,
});
export type RubricScores = z.infer<typeof rubricScoresSchema>;

export const RUBRIC_CRITERIA = [
  { key: "coding", label: "Coding" },
  { key: "problemSolving", label: "Problem solving" },
  { key: "communication", label: "Communication" },
] as const satisfies readonly { key: keyof RubricScores; label: string }[];

export const submitFeedbackSchema = z.object({
  interviewId: z.string().min(1),
  rubricScores: rubricScoresSchema,
  notes: z.string().trim().max(5_000).optional(),
  recommendation: feedbackRecommendationSchema,
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
