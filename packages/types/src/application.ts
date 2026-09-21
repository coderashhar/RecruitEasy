import { z } from "zod";

export const applicationStatusSchema = z.enum([
  "APPLIED",
  "SCREENING",
  "INTERVIEWING",
  "OFFER",
  "HIRED",
  "REJECTED",
]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const createApplicationSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: applicationStatusSchema,
  /** Required to move an application out of HIRED or REJECTED — see lib/application-status.ts. */
  confirmOverturn: z.boolean().optional(),
});
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;

export const setShortlistedSchema = z.object({
  applicationId: z.string().min(1),
  shortlisted: z.boolean(),
});
export type SetShortlistedInput = z.infer<typeof setShortlistedSchema>;
