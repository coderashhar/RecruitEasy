import "server-only";

import { practiceRunRequestSchema, type ExecutionResult } from "@interviewhub/types";
import { runOnJudge0 } from "./judge0";
import { consumeRateLimit, rateLimitRemaining, RateLimitError, releaseRateLimit } from "./rate-limit";

export class PracticeError extends Error {}

/**
 * Practice runs share Judge0 with live interviews, on one VPS with a queue of
 * 20 (infra/judge0/judge0.conf's MAX_QUEUE_SIZE). A candidate hammering Run
 * must not be able to fill that queue while an interview is trying to use it.
 * 30 an hour is generous for someone working through a problem.
 */
export const PRACTICE_RUN_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

function practiceKey(userId: string) {
  return `practice:${userId}`;
}

export type PracticeRunOutcome = Omit<ExecutionResult, "id">;

export function practiceRunsRemaining(userId: string): Promise<number> {
  return rateLimitRemaining({ key: practiceKey(userId), ...PRACTICE_RUN_LIMIT });
}

/**
 * Runs a candidate's practice code. Nothing is stored except the rate-limit
 * hit: practice is private scratch work, not part of any hiring record.
 *
 * `input` is validated here rather than trusted, since the Server Action that
 * calls this is directly invocable with anything.
 */
export async function runPracticeCode(
  userId: string,
  input: unknown,
): Promise<{ result: PracticeRunOutcome; remaining: number }> {
  const parsed = practiceRunRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PracticeError(parsed.error.issues[0]?.message ?? "Invalid run request.");
  }

  let hit: { hitId: string; remaining: number };
  try {
    hit = await consumeRateLimit({ key: practiceKey(userId), ...PRACTICE_RUN_LIMIT });
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new PracticeError(
        `You've used all ${PRACTICE_RUN_LIMIT.limit} practice runs for this hour. Try again later.`,
      );
    }
    throw err;
  }

  try {
    const result = await runOnJudge0(parsed.data);
    return { result, remaining: hit.remaining };
  } catch (err) {
    // The service being down isn't the candidate's run: hand the attempt back,
    // and report it in the output panel the same way an interview Run does.
    console.error(`[practice] Judge0 call failed for user ${userId}`, err);
    await releaseRateLimit(hit.hitId);
    return {
      result: {
        status: "FAILED",
        stdout: null,
        stderr: "The execution service is unavailable. Try again in a moment.",
        timeMs: null,
        memoryKb: null,
      },
      remaining: hit.remaining + 1,
    };
  }
}
