import "server-only";

import { Prisma, prisma, type Application } from "@interviewhub/db";
import type {
  CreateApplicationInput,
  SetShortlistedInput,
  UpdateApplicationStatusInput,
} from "@interviewhub/types";
import { applicationStatusEmail } from "./email-templates";
import { notifyUser } from "./notifications";

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

/**
 * Moves an application to a new status — this is what records the hiring
 * decision (PRD workflow step 10: OFFER / HIRED / REJECTED).
 *
 * No transition table: unlike interview lifecycle (scheduled interviews carry
 * real-world consequences — a room, a token, other people's calendars — that
 * make an illegal transition actively harmful), an application's status is a
 * single label a recruiter is directly setting by hand. Any status to any
 * other is a legitimate correction (moving someone back from REJECTED to
 * SCREENING because a decision was reversed is a real, valid action, not a
 * bug to guard against).
 */
export async function updateApplicationStatus(
  orgId: string,
  actorId: string,
  input: UpdateApplicationStatusInput,
): Promise<Application> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, job: { orgId } },
  });
  if (!application) {
    throw new ApplicationError("Application not found in your organization.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Pins the status the audit log is about to claim we moved *from*. The
    // read happened outside this transaction, so without it a concurrent
    // change would leave the audit trail recording a transition that never
    // happened.
    const { count } = await tx.application.updateMany({
      where: { id: application.id, status: application.status },
      data: { status: input.status },
    });

    if (count === 0) {
      throw new ApplicationError(
        "This application was changed by someone else — reload and try again.",
      );
    }

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: "application.status_changed",
        target: application.id,
        meta: { from: application.status, to: input.status },
      },
    });

    return tx.application.findUniqueOrThrow({ where: { id: application.id } });
  });

  // Fire-and-forget: notify candidate of status change. Fetches candidate +
  // job info outside the transaction — the write already committed, so a
  // notification failure must not roll anything back.
  notifyApplicationStatusChange(application.id, input.status).catch(() => {});

  return result;
}

/**
 * Marks or unmarks an application as shortlisted. Internal to the hiring team:
 * no status change and no message to the candidate.
 *
 * Setting the state it already has is a no-op rather than a second audit
 * entry, so a double-click doesn't record two decisions.
 */
export async function setApplicationShortlisted(
  orgId: string,
  actorId: string,
  input: SetShortlistedInput,
): Promise<{ shortlisted: boolean }> {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, job: { orgId } },
    select: { id: true, shortlistedAt: true },
  });
  if (!application) {
    throw new ApplicationError("Application not found in your organization.");
  }

  if ((application.shortlistedAt !== null) === input.shortlisted) {
    return { shortlisted: input.shortlisted };
  }

  await prisma.$transaction(async (tx) => {
    // Conditional on the state just read, like the status update: two people
    // toggling at once produce one recorded change, not two contradictory ones.
    const { count } = await tx.application.updateMany({
      where: {
        id: application.id,
        shortlistedAt: input.shortlisted ? null : { not: null },
      },
      data: { shortlistedAt: input.shortlisted ? new Date() : null },
    });
    if (count === 0) return;

    await tx.auditLog.create({
      data: {
        orgId,
        actorId,
        action: input.shortlisted ? "application.shortlisted" : "application.unshortlisted",
        target: application.id,
      },
    });
  });

  return { shortlisted: input.shortlisted };
}

async function notifyApplicationStatusChange(
  applicationId: string,
  status: string,
): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      candidate: { select: { id: true, name: true, email: true } },
      job: { select: { title: true } },
    },
  });
  if (!app) return;

  const emailContent = applicationStatusEmail(app.candidate.name, app.job.title, status);

  await notifyUser(app.candidate.id, {
    type: `application.${status.toLowerCase()}`,
    title: emailContent?.subject ?? `Application status: ${status}`,
    body: `Your application for ${app.job.title} has been updated to ${status}.`,
    link: "/candidate",
    email: emailContent
      ? {
          to: app.candidate.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        }
      : undefined,
  });
}
