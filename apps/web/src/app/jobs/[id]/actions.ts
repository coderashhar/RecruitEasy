"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/users";
import { applyToJob, ApplyError } from "@/lib/apply";

export async function submitApplication(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  const jobId = formData.get("jobId");
  const file = formData.get("resume");

  if (typeof jobId !== "string" || !jobId) {
    return { error: "Missing job ID." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please upload your resume." };
  }

  try {
    await applyToJob(user.id, user.orgId, jobId, file);
  } catch (err) {
    if (err instanceof ApplyError) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/candidate");
}
