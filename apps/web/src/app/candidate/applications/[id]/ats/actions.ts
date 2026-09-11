"use server";

import { requireCurrentUser } from "@/lib/users";
import { polishResume, PolishError } from "@/lib/resume-polish";
import type { PolishResponse } from "@interviewhub/types";

export async function requestPolish(
  applicationId: string,
): Promise<{ data?: PolishResponse; error?: string }> {
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  try {
    const data = await polishResume(applicationId, user.id);
    return { data };
  } catch (err) {
    if (err instanceof PolishError) return { error: err.message };
    return { error: "Something went wrong. Please try again." };
  }
}
