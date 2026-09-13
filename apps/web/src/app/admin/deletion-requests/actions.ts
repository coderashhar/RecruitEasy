"use server";

import { revalidatePath } from "next/cache";
import {
  DataDeletionError,
  processDeletionRequest,
  rejectDeletionRequest,
  type DeletionSummary,
} from "@/lib/data-deletion";
import { requireCurrentUser } from "@/lib/users";

export async function approveDeletion(requestId: string): Promise<{ summary?: DeletionSummary; error?: string }> {
  const { user } = await requireCurrentUser(["ADMIN"]);
  try {
    const summary = await processDeletionRequest(user.orgId, user.id, requestId);
    revalidatePath("/admin/deletion-requests");
    return { summary };
  } catch (err) {
    if (err instanceof DataDeletionError) return { error: err.message };
    throw err;
  }
}

export async function rejectDeletion(requestId: string, reason: string): Promise<{ error?: string }> {
  const { user } = await requireCurrentUser(["ADMIN"]);
  try {
    await rejectDeletionRequest(user.orgId, user.id, requestId, reason);
    revalidatePath("/admin/deletion-requests");
    return {};
  } catch (err) {
    if (err instanceof DataDeletionError) return { error: err.message };
    throw err;
  }
}
