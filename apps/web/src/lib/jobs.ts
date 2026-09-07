import "server-only";

import { prisma, type Job } from "@interviewhub/db";
import type { CreateJobInput } from "@interviewhub/types";

/**
 * Creates a job in the caller's own org.
 *
 * Unlike scheduleInterviewForOrg there is nothing to validate against another
 * table here — `orgId` comes from the caller's own provisioned user row, never
 * from the form — so this is a straight write plus its audit trail. The
 * transaction exists so a job can never be created without the AuditLog row
 * that records who created it (NFR §9: audit logs for recruiter actions).
 */
export async function createJobForOrg(
  orgId: string,
  actorId: string,
  input: CreateJobInput,
): Promise<Job> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        orgId,
        title: input.title,
        description: input.description,
        requiredSkills: input.requiredSkills,
      },
    });

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "job.created",
        target: job.id,
        meta: { title: job.title },
      },
    });

    return job;
  });
}
