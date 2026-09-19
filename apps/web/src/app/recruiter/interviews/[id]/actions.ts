"use server";

import { revalidatePath } from "next/cache";
import {
  interviewObserverSchema,
  rescheduleInterviewSchema,
  submitFeedbackSchema,
  updateInterviewStatusSchema,
} from "@interviewhub/types";
import { FeedbackError, submitFeedback } from "@/lib/feedback";
import {
  LifecycleError,
  rescheduleInterview as rescheduleInterviewForOrg,
  updateInterviewStatusAsInterviewer,
  updateInterviewStatus as updateInterviewStatusForOrg,
} from "@/lib/interview-lifecycle";
import { addInterviewObserver, ObserverError, removeInterviewObserver } from "@/lib/interview-observers";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

/**
 * RECRUITER/ADMIN may make any legal move. Anyone else may only start or
 * complete an interview they sit on as an interviewer, checked against the
 * participant row in updateInterviewStatusAsInterviewer, since this action is
 * directly invocable whatever buttons the page shows.
 */
export async function changeInterviewStatus(formData: FormData) {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  const parsed = updateInterviewStatusSchema.safeParse({
    interviewId: formData.get("interviewId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    if (role === "RECRUITER" || role === "ADMIN") {
      await updateInterviewStatusForOrg(user.orgId, user.id, parsed.data);
    } else {
      await updateInterviewStatusAsInterviewer(user.orgId, user.id, parsed.data);
    }
  } catch (err) {
    if (err instanceof LifecycleError) throw new Error(err.message);
    throw err;
  }

  revalidatePath(`/recruiter/interviews/${parsed.data.interviewId}`);
  revalidatePath("/recruiter/feedback");
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

/**
 * Deliberately gated by ROLES (any signed-in role), not RECRUITER/ADMIN:
 * eligibility here is per-interview, not per-platform-role, and submitFeedback
 * does the real check against the INTERVIEWER participant row. A RECRUITER who
 * actually sat in as the interviewer should be able to submit; a CANDIDATE
 * invoking this Server Action directly for their own interview must not.
 */
export async function submitFeedbackAction(formData: FormData) {
  const { user } = await requireCurrentUser(ROLES);

  const parsed = submitFeedbackSchema.safeParse({
    interviewId: formData.get("interviewId"),
    rubricScores: {
      coding: Number(formData.get("coding")),
      problemSolving: Number(formData.get("problemSolving")),
      communication: Number(formData.get("communication")),
    },
    notes: formData.get("notes") || undefined,
    recommendation: formData.get("recommendation"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await submitFeedback(user.id, parsed.data);
  } catch (err) {
    if (err instanceof FeedbackError) throw new Error(err.message);
    throw err;
  }

  revalidatePath(`/recruiter/interviews/${parsed.data.interviewId}`);
}

/** RECRUITER/ADMIN only, like the other actions that change who is in an interview. */
export async function changeObserverAction(formData: FormData) {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = interviewObserverSchema.safeParse({
    interviewId: formData.get("interviewId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    throw new Error("Pick someone to add.");
  }

  try {
    if (formData.get("intent") === "remove") {
      await removeInterviewObserver(user.orgId, user.id, parsed.data);
    } else {
      await addInterviewObserver(user.orgId, user.id, parsed.data);
    }
  } catch (err) {
    if (err instanceof ObserverError) throw new Error(err.message);
    throw err;
  }

  revalidatePath(`/recruiter/interviews/${parsed.data.interviewId}`);
}
