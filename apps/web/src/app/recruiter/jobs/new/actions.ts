"use server";

import { redirect } from "next/navigation";
import { createJobSchema } from "@interviewhub/types";
import { createJobForOrg } from "@/lib/jobs";
import { requireCurrentUser } from "@/lib/users";

/**
 * Only RECRUITER/ADMIN may post a job — narrower than the recruiter section's
 * layout guard, which also lets INTERVIEWER browse it. Same split as
 * scheduleInterview: an interviewer runs interviews, they don't own the pipeline.
 */
export async function createJob(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = createJobSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    // The schema handles the comma-split; passing the raw field keeps that
    // decision in one place rather than duplicating it per form.
    requiredSkills: formData.get("requiredSkills") ?? "",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  await createJobForOrg(user.orgId, user.id, parsed.data);

  redirect("/recruiter");
}
