import { z } from "zod";

// Matches Judge0's language_id enum for the languages we support at launch.
export const supportedLanguageSchema = z.enum([
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
  "go",
]);
export type SupportedLanguage = z.infer<typeof supportedLanguageSchema>;

/**
 * What a fresh CodeDocument is created with before anyone picks a language.
 * Shared across the process boundary: apps/realtime/src/rooms.ts falls back
 * to this when persisting a snapshot with no language set yet, and the web
 * editor (interview-room.tsx) needs the same value so its language picker
 * isn't lying about what a brand-new room will actually persist as.
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = "javascript";

export const executeRequestSchema = z.object({
  interviewId: z.string().min(1),
  language: supportedLanguageSchema,
  source: z.string().min(1).max(50_000),
  stdin: z.string().max(10_000).optional(),
});
export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

export const executionStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

export const executionResultSchema = z.object({
  id: z.string().min(1),
  status: executionStatusSchema,
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  timeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
});
export type ExecutionResult = z.infer<typeof executionResultSchema>;
