"use server";

import { revalidatePath } from "next/cache";
import { applicationStatusSchema, updateApplicationStatusSchema } from "@interviewhub/types";
import { ApplicationError, updateApplicationStatus } from "@/lib/applications";
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

/**
 * Moves multiple applications to the same status in one call.
 * Each application is updated individually to preserve per-row audit trails
 * and the optimistic-lock pattern in updateApplicationStatus.
 */
export async function bulkChangeApplicationStatus(
  applicationIds: string[],
  status: string,
) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = applicationStatusSchema.safeParse(status);
  if (!parsed.success) throw new Error("Invalid status.");

  const errors: string[] = [];

  for (const applicationId of applicationIds) {
    try {
      await updateApplicationStatus(user.orgId, user.id, {
        applicationId,
        status: parsed.data,
      });
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
}
