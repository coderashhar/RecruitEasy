"use server";

import { redirect } from "next/navigation";
import { scheduleInterviewSchema } from "@interviewhub/types";
import { requireCurrentUser } from "@/lib/users";
import {
  getInterviewerBusy,
  scheduleInterviewForOrg,
  SchedulingError,
  type BusyInterval,
} from "@/lib/scheduling";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Only RECRUITER/ADMIN may schedule — narrower than the recruiter section's own
 * layout guard (which also lets INTERVIEWER browse it), matching PRD FR-5.1
 * ("Recruiters shall be able to create... interview slots").
 *
 * Returns an error instead of throwing for the expected failures — a panel
 * member booked while the recruiter was choosing, above all — so the flow can
 * say "nothing was sent" in place and offer the grid again.
 */
export async function scheduleInterview(formData: FormData): Promise<{ error?: string; conflict?: boolean }> {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);

  const parsed = scheduleInterviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMins: Number(formData.get("durationMins") || 60),
    interviewerIds: formData.getAll("interviewerIds"),
    observerIds: formData.getAll("observerIds"),
    round: Number(formData.get("round") || 1),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await scheduleInterviewForOrg(user.orgId, user.id, parsed.data);
  } catch (err) {
    if (err instanceof SchedulingError) {
      return { error: err.message, conflict: /booked/i.test(err.message) };
    }
    throw err;
  }

  redirect("/recruiter/interviews");
}

/**
 * The chosen panel's bookings for one week, read before a time is picked.
 * `weekStart` is an ISO instant computed in the browser, so the week lines up
 * with the recruiter's own calendar rather than the server's timezone.
 */
export async function loadPanelBusy(interviewerIds: string[], weekStart: string): Promise<BusyInterval[]> {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const from = new Date(weekStart);
  if (Number.isNaN(from.getTime()) || !Array.isArray(interviewerIds)) return [];
  const ids = interviewerIds.filter((id): id is string => typeof id === "string").slice(0, 20);
  return getInterviewerBusy(user.orgId, ids, from, new Date(from.getTime() + WEEK_MS));
}
