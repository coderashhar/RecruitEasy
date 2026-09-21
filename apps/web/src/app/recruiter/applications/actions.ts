"use server";

import { revalidatePath } from "next/cache";
import {
  applicationStatusSchema,
  setShortlistedSchema,
  updateApplicationStatusSchema,
} from "@interviewhub/types";
import { classifyStatusChange } from "@/lib/application-status";
import {
  ApplicationError,
  getApplicationStatus,
  setApplicationShortlisted,
  updateApplicationStatus,
} from "@/lib/applications";
import { requireCurrentUser } from "@/lib/users";

/**
 * Backs the inline status <select> on the recruiter dashboard's pipeline
 * table. Stays on the same page (no redirect) — revalidatePath refreshes the
 * server-rendered table in place.
 */
export async function changeApplicationStatus(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = updateApplicationStatusSchema.safeParse({
    applicationId: formData.get("applicationId"),
    status: formData.get("status"),
    confirmOverturn: formData.get("confirmOverturn") === "true",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await updateApplicationStatus(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof ApplicationError) throw new Error(err.message);
    throw err;
  }

  revalidatePath("/recruiter");
}

export interface BulkStatusResult {
  moved: number;
  /** Already at the target status: nothing written, nobody emailed. */
  unchanged: number;
  /** Already HIRED or REJECTED. Bulk never overturns a decision; that is one at a time, confirmed. */
  decided: number;
}

/**
 * Moves multiple applications to the same status in one call.
 * Each application is updated individually to preserve per-row audit trails
 * and the optimistic-lock pattern in updateApplicationStatus.
 *
 * Never passes confirmOverturn: one confirmation for a whole selection would
 * overturn decisions nobody looked at individually.
 */
export async function bulkChangeApplicationStatus(
  applicationIds: string[],
  status: string,
): Promise<BulkStatusResult> {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = applicationStatusSchema.safeParse(status);
  if (!parsed.success) throw new Error("Invalid status.");

  const errors: string[] = [];
  const result: BulkStatusResult = { moved: 0, unchanged: 0, decided: 0 };

  for (const applicationId of applicationIds) {
    try {
      const before = await getApplicationStatus(user.orgId, applicationId);
      if (before === null) throw new ApplicationError("Application not found in your organization.");
      const change = classifyStatusChange(before, parsed.data);
      if (change === "unchanged") {
        result.unchanged += 1;
        continue;
      }
      if (change === "overturn") {
        result.decided += 1;
        continue;
      }
      await updateApplicationStatus(user.orgId, user.id, {
        applicationId,
        status: parsed.data,
      });
      result.moved += 1;
    } catch (err) {
      errors.push(
        err instanceof ApplicationError
          ? `${applicationId}: ${err.message}`
          : `${applicationId}: unexpected error`,
      );
    }
  }

  revalidatePath("/recruiter");

  if (errors.length > 0) {
    throw new Error(`${errors.length} application(s) failed to update.`);
  }
  return result;
}

/** RECRUITER/ADMIN only, like every other pipeline decision. */
export async function toggleShortlist(applicationId: string, shortlisted: boolean) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = setShortlistedSchema.safeParse({ applicationId, shortlisted });
  if (!parsed.success) throw new Error("Invalid input.");

  try {
    const result = await setApplicationShortlisted(user.orgId, user.id, parsed.data);
    revalidatePath("/recruiter");
    return result;
  } catch (err) {
    if (err instanceof ApplicationError) throw new Error(err.message);
    throw err;
  }
}
