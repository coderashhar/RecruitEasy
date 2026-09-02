import "server-only";

import { Prisma, prisma, type Application } from "@interviewhub/db";
import type { CreateApplicationInput } from "@interviewhub/types";

export class ApplicationError extends Error {}

/**
 * Adds a candidate to a job, both of which must belong to the caller's org.
 *
 * Same reasoning as scheduleInterviewForOrg: the form only ever renders this
 * org's jobs and candidates, but a Server Action is directly invocable, so an
 * id borrowed from another org — or a RECRUITER's id passed where a candidate
 * is expected — has to be rejected here rather than trusted.
 */
export async function createApplicationForOrg(
  orgId: string,
  actorId: string,
  input: CreateApplicationInput,
): Promise<Application> {
  const [job, candidate] = await Promise.all([
    prisma.job.findFirst({ where: { id: input.jobId, orgId }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: input.candidateId, orgId, role: "CANDIDATE" },
      select: { id: true },
    }),
  ]);

  if (!job) throw new ApplicationError("Job not found in your organization.");
  if (!candidate) throw new ApplicationError("Candidate not found in your organization.");

  try {
    return await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: { jobId: job.id, candidateId: candidate.id },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId,
          action: "application.created",
          target: application.id,
          meta: { jobId: job.id, candidateId: candidate.id },
        },
      });

      return application;
    });
  } catch (err) {
    // P2002 is the unique index on (jobId, candidateId). Catching it here —
    // rather than checking for an existing row first — keeps the check atomic:
    // a pre-flight findFirst would still let two concurrent submits both pass.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApplicationError("That candidate has already applied to this job.");
    }
    throw err;
  }
}
