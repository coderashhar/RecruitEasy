"use server";

import { redirect } from "next/navigation";
import { createApplicationSchema } from "@interviewhub/types";
import { ApplicationError, createApplicationForOrg } from "@/lib/applications";
import { requireCurrentUser } from "@/lib/users";

export interface ApplicationFormState {
  error: string | null;
}

/**
 * Returns the message rather than throwing it: "That candidate has already
 * applied to this job" is an answer the recruiter acts on in the form, not a
 * fault. Anything that isn't an ApplicationError is a real fault and still
 * throws, so it reaches the error boundary and the logs.
 */
export async function createApplication(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = createApplicationSchema.safeParse({
    jobId: formData.get("jobId"),
    candidateId: formData.get("candidateId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a job and a candidate." };
  }

  try {
    await createApplicationForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof ApplicationError) return { error: err.message };
    throw err;
  }

  redirect("/recruiter");
}
