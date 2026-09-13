import "server-only";

import { prisma, type FeedbackRecommendation } from "@interviewhub/db";
import { RUBRIC_CRITERIA, type RubricScores } from "@interviewhub/types";

export interface FeedbackSummary {
  count: number;
  /** Mean score per rubric criterion across every submitted feedback, or null with none. */
  averages: Record<keyof RubricScores, number | null>;
  recommendations: Record<FeedbackRecommendation, number>;
}

/**
 * Collapses every interviewer's feedback across every round into one view.
 *
 * Criteria are averaged independently, and a feedback row missing a criterion
 * (rubricScores is a Json column, so older or malformed rows are possible)
 * simply doesn't count toward that criterion rather than dragging it to zero.
 */
export function summarizeFeedback(
  feedback: Array<{ rubricScores: unknown; recommendation: FeedbackRecommendation }>,
): FeedbackSummary {
  const recommendations: Record<FeedbackRecommendation, number> = {
    STRONG_YES: 0,
    YES: 0,
    NO: 0,
    STRONG_NO: 0,
  };
  const totals = new Map<string, { sum: number; n: number }>();

  for (const entry of feedback) {
    recommendations[entry.recommendation] += 1;
    const scores = (entry.rubricScores ?? {}) as Record<string, unknown>;
    for (const { key } of RUBRIC_CRITERIA) {
      const value = scores[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const total = totals.get(key) ?? { sum: 0, n: 0 };
      totals.set(key, { sum: total.sum + value, n: total.n + 1 });
    }
  }

  const averages = Object.fromEntries(
    RUBRIC_CRITERIA.map(({ key }) => {
      const total = totals.get(key);
      return [key, total ? Math.round((total.sum / total.n) * 10) / 10 : null];
    }),
  ) as Record<keyof RubricScores, number | null>;

  return { count: feedback.length, averages, recommendations };
}

/**
 * Everything known about one application, for the recruiter's profile page.
 * Org-scoped through the job, like every read in queries.ts: an application id
 * from another org returns null, indistinguishable from one that doesn't exist.
 */
export async function getApplicationProfile(orgId: string, applicationId: string) {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, job: { orgId } },
    include: {
      candidate: { select: { id: true, name: true, email: true } },
      job: { select: { id: true, title: true, requiredSkills: true } },
      resumes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { atsReports: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      interviews: {
        orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
        include: {
          participants: {
            where: { role: "INTERVIEWER" },
            include: { user: { select: { id: true, name: true } } },
          },
          feedback: {
            orderBy: { createdAt: "asc" },
            include: { interviewer: { select: { id: true, name: true } } },
          },
          _count: { select: { integritySignals: true } },
        },
      },
    },
  });
  if (!application) return null;

  const feedbackSummary = summarizeFeedback(
    application.interviews.flatMap((interview) => interview.feedback),
  );

  return { ...application, feedbackSummary };
}

/** The latest resume's storage key for an application in this org, or null. */
export async function getLatestResumeKey(orgId: string, applicationId: string) {
  const resume = await prisma.resume.findFirst({
    where: { applicationId, application: { job: { orgId } } },
    orderBy: { createdAt: "desc" },
    select: { fileKey: true },
  });
  return resume?.fileKey ?? null;
}
