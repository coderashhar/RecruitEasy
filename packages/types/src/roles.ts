import { z } from "zod";

export const userRoleSchema = z.enum(["CANDIDATE", "INTERVIEWER", "RECRUITER", "ADMIN"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const interviewParticipantRoleSchema = z.enum(["CANDIDATE", "INTERVIEWER", "OBSERVER"]);
export type InterviewParticipantRole = z.infer<typeof interviewParticipantRoleSchema>;

/**
 * UserRoles allowed to hold the INTERVIEWER participant role on an interview.
 * RECRUITER and ADMIN are included because either may run a live interview
 * themselves; CANDIDATE never is — a candidate cannot interview themselves.
 *
 * Shared by apps/web's scheduling validation (who a request may name as an
 * interviewer) and its query layer (who the schedule form offers as a
 * candidate) — two independent copies of this list is how one of them
 * silently drifts from the other.
 */
export const INTERVIEWER_CAPABLE_ROLES = ["INTERVIEWER", "RECRUITER", "ADMIN"] as const;
