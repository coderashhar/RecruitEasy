"use server";

import { revalidatePath } from "next/cache";
import { rescheduleInterviewSchema, updateInterviewStatusSchema } from "@interviewhub/types";
import {
  LifecycleError,
  rescheduleInterview as rescheduleInterviewForOrg,
  updateInterviewStatus as updateInterviewStatusForOrg,
} from "@/lib/interview-lifecycle";
import { requireCurrentUser } from "@/lib/users";

/**
 * RECRUITER/ADMIN only — mirrors scheduleInterview's own split (an
 * INTERVIEWER may browse and run interviews, but doesn't own the pipeline
 * decisions of cancelling, marking complete, or rescheduling one).
 */
export async function changeInterviewStatus(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = updateInterviewStatusSchema.safeParse({
    interviewId: formData.get("interviewId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await updateInterviewStatusForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof LifecycleError) throw new Error(err.message);
    throw err;
  }

  revalidatePath(`/recruiter/interviews/${parsed.data.interviewId}`);
}

export async function rescheduleInterviewAction(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = rescheduleInterviewSchema.safeParse({
    interviewId: formData.get("interviewId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMins: Number(formData.get("durationMins") || 0),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await rescheduleInterviewForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof LifecycleError) throw new Error(err.message);
    throw err;
  }

  revalidatePath(`/recruiter/interviews/${parsed.data.interviewId}`);
}
