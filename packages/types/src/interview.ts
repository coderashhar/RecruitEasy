import { z } from "zod";

export const interviewStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const scheduleInterviewSchema = z.object({
  applicationId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  durationMins: z.number().int().min(15).max(240).default(60),
  interviewerIds: z.array(z.string().min(1)).min(1),
});
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>;

export const rescheduleInterviewSchema = z.object({
  interviewId: z.string().min(1),
  scheduledAt: z.coerce.date(),
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
