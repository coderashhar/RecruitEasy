import "server-only";

import { Prisma, prisma, type Application, type ApplicationStatus } from "@interviewhub/db";
import type {
  CreateApplicationInput,
  SetShortlistedInput,
  UpdateApplicationStatusInput,
} from "@interviewhub/types";
import { classifyStatusChange } from "./application-status";
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
 * No full transition table: unlike the interview lifecycle, where an illegal
 * transition misrepresents a room, a token and other people's calendars, an
 * application's status is a label a recruiter sets by hand, and any move can
 * be a legitimate correction. Two moves are handled differently
 * (classifyStatusChange):
 *
 * - Setting the status it already has writes nothing and emails nobody. Bulk
 *   "Move to" over a selection that included such rows used to re-send the
 *   candidate the same status email.
 * - Overturning a decision (leaving HIRED or REJECTED) needs `confirmOverturn`.
 *   The candidate was already told the decision and will be emailed the new
 *   status too, so a stray change of a <select> shouldn't be able to do that.
 *   Checked here, not only in the UI: Server Actions are directly invocable.
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

  const change = classifyStatusChange(application.status, input.status);
  if (change === "unchanged") return application;
  if (change === "overturn" && !input.confirmOverturn) {
    throw new ApplicationError(
      `This candidate was already ${application.status === "HIRED" ? "hired" : "rejected"}. Confirm to change a decision they have been told.`,
    );
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
        meta: {
          from: application.status,
          to: input.status,
          ...(change === "overturn" && { overturned: true }),
        },
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

/** The current status of an application in this org, or null if it isn't one of the org's. */
export async function getApplicationStatus(orgId: string, applicationId: string): Promise<ApplicationStatus | null> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, job: { orgId } },
    select: { status: true },
  });
  return application?.status ?? null;
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
