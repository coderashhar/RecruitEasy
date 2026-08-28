import { z } from "zod";

export const userRoleSchema = z.enum(["CANDIDATE", "INTERVIEWER", "RECRUITER", "ADMIN"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const interviewParticipantRoleSchema = z.enum(["CANDIDATE", "INTERVIEWER", "OBSERVER"]);
export type InterviewParticipantRole = z.infer<typeof interviewParticipantRoleSchema>;
