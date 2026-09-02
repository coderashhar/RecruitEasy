"use server";

import { redirect } from "next/navigation";
import { scheduleInterviewSchema } from "@interviewhub/types";
import { requireCurrentUser } from "@/lib/users";
import { scheduleInterviewForOrg, SchedulingError } from "@/lib/scheduling";

/**
 * Only RECRUITER/ADMIN may schedule — narrower than the recruiter section's own
 * layout guard (which also lets INTERVIEWER browse it), matching PRD FR-5.1
 * ("Recruiters shall be able to create... interview slots").
 */
export async function scheduleInterview(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = scheduleInterviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMins: Number(formData.get("durationMins") || 60),
    interviewerIds: formData.getAll("interviewerIds"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await scheduleInterviewForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof SchedulingError) throw new Error(err.message);
    throw err;
  }

  redirect("/recruiter");
}
