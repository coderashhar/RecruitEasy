/**
 * Why a résumé couldn't be opened, in the recruiter's terms.
 *
 * Two states, not three: "nothing was ever uploaded" and "we can't open it"
 * are the only distinction that changes what a recruiter does next. Whether
 * the file is missing from the bucket or storage was never configured is an
 * operator's problem, so the route logs that and never shows it — a recruiter
 * can't act on an environment variable, and naming one only makes a small
 * gap look like a broken system.
 *
 * Pure and framework-free: the route picks the reason, the profile renders it.
 */
export const RESUME_ISSUES = ["none", "unavailable"] as const;
export type ResumeIssue = (typeof RESUME_ISSUES)[number];

export interface ResumeIssueCopy {
  title: string;
  detail: string;
}

const COPY: Record<ResumeIssue, ResumeIssueCopy> = {
  none: {
    title: "No résumé to open",
    detail: "This candidate was added by your team, so no file came with the application.",
  },
  unavailable: {
    title: "This résumé can't be opened",
    detail: "The file isn't available to download. The match below still reflects the résumé as it was submitted.",
  },
};

export function parseResumeIssue(raw: string | string[] | undefined): ResumeIssue | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return RESUME_ISSUES.includes(value as ResumeIssue) ? (value as ResumeIssue) : null;
}

export function resumeIssueCopy(issue: ResumeIssue): ResumeIssueCopy {
  return COPY[issue];
}
