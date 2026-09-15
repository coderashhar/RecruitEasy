"use server";

import { revalidatePath } from "next/cache";
import {
  DataDeletionError,
  getDeletionScope,
  processDeletionRequest,
  rejectDeletionRequest,
  type DeletionScope,
  type DeletionSummary,
} from "@/lib/data-deletion";
import { requireCurrentUser } from "@/lib/users";

export async function previewDeletion(requestId: string): Promise<{ scope?: DeletionScope; error?: string }> {
  const { user } = await requireCurrentUser(["ADMIN"]);
  try {
    return { scope: await getDeletionScope(user.orgId, requestId) };
  } catch (err) {
    if (err instanceof DataDeletionError) return { error: err.message };
    throw err;
  }
}

export async function approveDeletion(requestId: string): Promise<{ summary?: DeletionSummary; error?: string }> {
  const { user } = await requireCurrentUser(["ADMIN"]);
  try {
    // No revalidatePath here: it would re-render the queue without this row
    // before the admin has read the result, which is the only place a partial
    // failure is reported. The result's own "Done" refreshes the page.
    const summary = await processDeletionRequest(user.orgId, user.id, requestId);
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
    revalidatePath("/admin/deletion-requests", "layout");
    return {};
  } catch (err) {
    if (err instanceof DataDeletionError) return { error: err.message };
    throw err;
  }
}
