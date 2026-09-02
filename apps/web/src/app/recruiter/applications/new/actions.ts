"use server";

import { redirect } from "next/navigation";
import { createApplicationSchema } from "@interviewhub/types";
import { ApplicationError, createApplicationForOrg } from "@/lib/applications";
import { requireCurrentUser } from "@/lib/users";

export async function createApplication(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = createApplicationSchema.safeParse({
    jobId: formData.get("jobId"),
    candidateId: formData.get("candidateId"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await createApplicationForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    // ApplicationError messages are written to be shown to a recruiter;
    // anything else is a real fault and should surface as-is.
    if (err instanceof ApplicationError) throw new Error(err.message);
    throw err;
  }

  redirect("/recruiter");
}
