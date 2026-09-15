"use server";

import { revalidatePath } from "next/cache";
import { DataDeletionError, requestDataDeletion } from "@/lib/data-deletion";
import { requireCurrentUser } from "@/lib/users";

export async function requestMyDataDeletion(): Promise<{ error?: string }> {
  const { user, role } = await requireCurrentUser(["CANDIDATE"]);
  try {
    await requestDataDeletion({ id: user.id, orgId: user.orgId, role });
    revalidatePath("/candidate", "layout");
    return {};
  } catch (err) {
    if (err instanceof DataDeletionError) return { error: err.message };
    throw err;
  }
}
