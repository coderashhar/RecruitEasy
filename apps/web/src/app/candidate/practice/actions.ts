"use server";

import { PracticeError, runPracticeCode, type PracticeRunOutcome } from "@/lib/practice";
import { requireCurrentUser } from "@/lib/users";

export async function runPractice(input: {
  language: string;
  source: string;
  stdin?: string;
}): Promise<{ result?: PracticeRunOutcome; remaining?: number; error?: string }> {
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  try {
    return await runPracticeCode(user.id, input);
  } catch (err) {
    if (err instanceof PracticeError) return { error: err.message };
    console.error("[practice] run failed", err);
    return { error: "Something went wrong running your code. Try again." };
  }
}
