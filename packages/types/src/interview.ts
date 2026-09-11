import { z } from "zod";

export const interviewStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

/**
 * `z.coerce.date()` on its own is unsafe for anything reaching us from a form.
 * It runs `new Date(input)`, and `new Date(null)` is 1970-01-01 rather than an
 * error — so a directly-invoked Server Action that simply omits the field
 * (FormData.get returns null for a missing key) validates cleanly and rewrites
 * the interview to the epoch. Requiring a real Date or a non-empty string
 * first means only something actually submitted reaches the coercion.
 */
export const submittedDateSchema = z.union([z.date(), z.string().min(1)]).pipe(z.coerce.date());

export const scheduleInterviewSchema = z.object({
  applicationId: z.string().min(1),
  scheduledAt: submittedDateSchema,
  durationMins: z.number().int().min(15).max(240).default(60),
  interviewerIds: z.array(z.string().min(1)).min(1),
  round: z.number().int().min(1).default(1),
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const rescheduleInterviewSchema = z.object({
  interviewId: z.string().min(1),
  scheduledAt: submittedDateSchema,
  durationMins: z.number().int().min(15).max(240),
});
export type RescheduleInterviewInput = z.infer<typeof rescheduleInterviewSchema>;

export const updateInterviewStatusSchema = z.object({
  interviewId: z.string().min(1),
  status: interviewStatusSchema,
});
export type UpdateInterviewStatusInput = z.infer<typeof updateInterviewStatusSchema>;

// Server → realtime service, and realtime service → clients in a room.
export const interviewTokenClaimsSchema = z.object({
  interviewId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["CANDIDATE", "INTERVIEWER", "OBSERVER"]),
  exp: z.number(),
});
export type InterviewTokenClaims = z.infer<typeof interviewTokenClaimsSchema>;
