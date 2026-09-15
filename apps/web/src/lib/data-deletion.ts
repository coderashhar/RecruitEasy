import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@interviewhub/db";
import { notifyUser } from "./notifications";
import { deleteFile } from "./storage";

export class DataDeletionError extends Error {}

/**
 * A candidate asks for their data to be deleted. One open request at a time;
 * asking again while one is pending returns that one. Every admin in the org
 * is told, since nothing happens until one of them acts.
 */
export async function requestDataDeletion(user: { id: string; orgId: string; role: string }) {
  if (user.role !== "CANDIDATE") {
    throw new DataDeletionError("Only candidates can request deletion of their data here.");
  }

  const pending = await prisma.dataDeletionRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pending) return pending;

  const request = await prisma.dataDeletionRequest.create({
    data: { orgId: user.orgId, userId: user.id },
  });

  const admins = await prisma.user.findMany({
    where: { orgId: user.orgId, role: "ADMIN" },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) =>
      notifyUser(admin.id, {
        type: "privacy.deletion_requested",
        title: "Data deletion requested",
        body: "A candidate has asked for their data to be deleted.",
        link: "/admin/deletion-requests",
      }),
    ),
  );

  return request;
}

export async function getCandidateDeletionRequest(userId: string) {
  return prisma.dataDeletionRequest.findFirst({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
}

export async function getDeletionRequests(orgId: string) {
  const [pending, processed] = await Promise.all([
    prisma.dataDeletionRequest.findMany({
      where: { orgId, status: "PENDING" },
      orderBy: { requestedAt: "asc" },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            _count: { select: { applicationsAsCandidate: true } },
          },
        },
      },
    }),
    prisma.dataDeletionRequest.findMany({
      where: { orgId, status: { not: "PENDING" } },
      orderBy: { processedAt: "desc" },
      take: 50,
      include: { processedBy: { select: { name: true } } },
    }),
  ]);
  return { pending, processed };
}

async function loadPending(orgId: string, requestId: string) {
  const request = await prisma.dataDeletionRequest.findFirst({
    where: { id: requestId, orgId, status: "PENDING" },
    include: { user: { select: { id: true, clerkId: true, role: true } } },
  });
  if (!request) throw new DataDeletionError("That request isn't pending in your organisation.");
  return request;
}

export interface DeletionScope {
  applications: number;
  interviews: number;
  files: number;
  hasAccount: boolean;
}

/**
 * What approving a request would delete, counted now — shown in the confirm
 * dialog so an admin reads the size of the decision before making it. Uses
 * the same pending-in-this-org check as processing, so it can't be pointed at
 * another org's request.
 */
export async function getDeletionScope(orgId: string, requestId: string): Promise<DeletionScope> {
  const request = await loadPending(orgId, requestId);
  const candidateId = request.user?.id;
  if (!candidateId) return { applications: 0, interviews: 0, files: 0, hasAccount: false };

  const [applications, interviews, resumes, recordings] = await Promise.all([
    prisma.application.count({ where: { candidateId } }),
    prisma.interview.count({ where: { application: { candidateId } } }),
    prisma.resume.count({ where: { application: { candidateId } } }),
    prisma.recording.count({ where: { interview: { application: { candidateId } }, fileKey: { not: null } } }),
  ]);
  return { applications, interviews, files: resumes + recordings, hasAccount: true };
}

export interface DeletionSummary {
  applications: number;
  filesDeleted: number;
  filesFailed: string[];
  identityDeleted: boolean;
}

/**
 * Deletes everything held about the requesting candidate, then the candidate.
 *
 * In the database, one transaction:
 * - their applications, which cascade to resumes and ATS reports, and to
 *   every interview with its code, runs, chat, feedback, integrity signals
 *   and recording row;
 * - rate-limit counters keyed to them or their applications;
 * - the user row itself, which cascades to notifications, chat and
 *   participant rows, and nulls this request's userId.
 *
 * Afterwards, outside the transaction because they can't roll back with it:
 * the resume and recording files in R2, and the Clerk account, so they can't
 * sign back in to a half-empty profile. A failure there is reported back to
 * the admin and logged, not retried silently.
 *
 * Audit rows stay: they record who did what, and hold ids, not personal
 * details. The candidate's own audit rows lose their actor via SetNull.
 */
export async function processDeletionRequest(
  orgId: string,
  adminId: string,
  requestId: string,
): Promise<DeletionSummary> {
  const request = await loadPending(orgId, requestId);
  const candidate = request.user;
  if (!candidate || candidate.role !== "CANDIDATE") {
    throw new DataDeletionError("This request's account is gone or isn't a candidate account.");
  }

  const applications = await prisma.application.findMany({
    where: { candidateId: candidate.id },
    select: {
      id: true,
      resumes: { select: { fileKey: true } },
      interviews: { select: { recording: { select: { fileKey: true } } } },
    },
  });
  const applicationIds = applications.map((application) => application.id);
  const fileKeys = applications.flatMap((application) => [
    ...application.resumes.map((resume) => resume.fileKey),
    ...application.interviews.flatMap((interview) => (interview.recording?.fileKey ? [interview.recording.fileKey] : [])),
  ]);

  await prisma.$transaction(async (tx) => {
    // Conditional, so two admins processing at once delete once.
    const { count } = await tx.dataDeletionRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "COMPLETED", processedAt: new Date(), processedById: adminId },
    });
    if (count === 0) throw new DataDeletionError("Someone else already processed this request.");

    await tx.rateLimitHit.deleteMany({
      where: {
        key: { in: [`practice:${candidate.id}`, ...applicationIds.map((id) => `polish:${id}`)] },
      },
    });
    await tx.application.deleteMany({ where: { candidateId: candidate.id } });
    await tx.user.delete({ where: { id: candidate.id } });

    await tx.auditLog.create({
      data: {
        orgId,
        actorId: adminId,
        action: "privacy.data_deleted",
        target: request.id,
        meta: { applications: applicationIds.length, files: fileKeys.length },
      },
    });
  });

  const filesFailed: string[] = [];
  for (const key of fileKeys) {
    if (!(await deleteFile(key))) filesFailed.push(key);
  }

  let identityDeleted = false;
  try {
    const client = await clerkClient();
    await client.users.deleteUser(candidate.clerkId);
    identityDeleted = true;
  } catch (err) {
    console.error(`[data-deletion] Clerk account ${candidate.clerkId} not deleted`, err);
  }

  return {
    applications: applicationIds.length,
    filesDeleted: fileKeys.length - filesFailed.length,
    filesFailed,
    identityDeleted,
  };
}

export async function rejectDeletionRequest(orgId: string, adminId: string, requestId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new DataDeletionError("Give the candidate a reason.");

  const request = await loadPending(orgId, requestId);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.dataDeletionRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "REJECTED", reason: trimmed.slice(0, 1000), processedAt: new Date(), processedById: adminId },
    });
    if (count === 0) throw new DataDeletionError("Someone else already processed this request.");

    await tx.auditLog.create({
      data: { orgId, actorId: adminId, action: "privacy.deletion_rejected", target: request.id },
    });
  });

  if (request.userId) {
    await notifyUser(request.userId, {
      type: "privacy.deletion_rejected",
      title: "Your data deletion request was declined",
      body: trimmed,
      link: "/candidate",
    });
  }
}
