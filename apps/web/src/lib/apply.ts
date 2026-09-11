import "server-only";

import { Prisma, prisma } from "@interviewhub/db";
import { parseResume, ResumeParseError } from "./resume-parser";
import { uploadFile } from "./storage";

export class ApplyError extends Error {}

/**
 * A candidate applies to a job by uploading a resume.
 *
 * Creates the Application (APPLIED), uploads the resume to R2, parses
 * it, and stores the Resume row with extracted text. All writes happen
 * in a transaction so a partial apply (application without resume) is
 * impossible.
 */
export async function applyToJob(
  userId: string,
  orgId: string,
  jobId: string,
  file: File,
): Promise<{ applicationId: string; resumeId: string }> {
  // Validate job exists in org.
  const job = await prisma.job.findFirst({
    where: { id: jobId, orgId },
    select: { id: true },
  });
  if (!job) throw new ApplyError("Job not found.");

  // Validate user is a candidate in this org.
  const candidate = await prisma.user.findFirst({
    where: { id: userId, orgId, role: "CANDIDATE" },
    select: { id: true },
  });
  if (!candidate) throw new ApplyError("Only candidates can apply.");

  // Parse and upload the resume.
  let parsed: Awaited<ReturnType<typeof parseResume>>;
  try {
    parsed = await parseResume(file);
  } catch (err) {
    if (err instanceof ResumeParseError) throw new ApplyError(err.message);
    throw err;
  }

  const fileKey = `resumes/${userId}/${jobId}.${parsed.extension}`;
  await uploadFile(fileKey, parsed.buffer, file.type);

  // Create application + resume in one transaction.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: { jobId, candidateId: userId },
      });

      const resume = await tx.resume.create({
        data: {
          applicationId: application.id,
          uploadedById: userId,
          fileKey,
          parsedText: parsed.text,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: "application.created",
          target: application.id,
          meta: { jobId, resumeId: resume.id },
        },
      });

      return { applicationId: application.id, resumeId: resume.id };
    });

    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApplyError("You have already applied to this job.");
    }
    throw err;
  }
}
