"use server";

import { redirect } from "next/navigation";
import { createJobSchema } from "@interviewhub/types";
import { createJobForOrg } from "@/lib/jobs";
import { requireCurrentUser } from "@/lib/users";

export interface JobFormState {
  error: string | null;
}

/**
 * Only RECRUITER/ADMIN may post a job — narrower than the recruiter section's
 * layout guard, which also lets INTERVIEWER browse it. Same split as
 * scheduleInterview: an interviewer runs interviews, they don't own the pipeline.
 *
 * Returns the message instead of throwing: a rejected title or description is
 * something the recruiter fixes in the form they are already looking at, not
 * a crash that should throw away what they typed.
 */
export async function createJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = createJobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    // The schema handles the comma-split; passing the raw field keeps that
    // decision in one place rather than duplicating it per form.
    requiredSkills: formData.get("requiredSkills") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  await createJobForOrg(user.orgId, user.id, parsed.data);

  redirect("/recruiter/jobs");
}
