import "server-only";

import { prisma, type Execution } from "@interviewhub/db";
import type { ExecuteRequest, ExecutionResult } from "@interviewhub/types";
import { authorizeInterviewAccess } from "./interview-access";
import { runOnJudge0 } from "./judge0";
import { broadcastToRoom } from "./realtime-broadcast";

export class ExecutionError extends Error {}

/**
 * Runs a participant's code through Judge0 and records the result.
 *
 * Authorized by participant row — the same authorizeInterviewAccess gate
 * the room and video tokens use, not platform role: an INTERVIEWER
 * somewhere in the org who isn't a participant of THIS interview must not
 * be able to run code in it.
 *
 * Never throws on a Judge0 or network failure — that becomes a FAILED
 * Execution row like any other failed run, visible to every participant
 * exactly the way a compile error is (FR-2.3: output visible to all
 * participants, not a special case for whoever clicked Run).
 * ExecutionError is reserved for the one case worth failing the request
 * itself over: you don't belong in this room at all.
 */
export async function submitExecution(userId: string, input: ExecuteRequest): Promise<Execution> {
  const access = await authorizeInterviewAccess(input.interviewId, userId);
  if (!access) {
    throw new ExecutionError("You are not a participant of this interview.");
  }
  // Server Actions are directly invocable, so hiding the Run button from an
  // observer is not enough on its own.
  if (access.participantRole === "OBSERVER") {
    throw new ExecutionError("Observers can watch, but not run code.");
  }

  const execution = await prisma.execution.create({
    data: {
      interviewId: input.interviewId,
      language: input.language,
      source: input.source,
      stdin: input.stdin,
    },
  });

  try {
    const result = await runOnJudge0(input);
    return await prisma.execution.update({
      where: { id: execution.id },
      data: result,
    });
  } catch (err) {
    console.error(`[execution] Judge0 call failed for interview ${input.interviewId}`, err);
    return prisma.execution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        stderr: "The execution service is unavailable. Try again in a moment.",
      },
    });
  } finally {
    await broadcastToRoom({ interviewId: input.interviewId, executionId: execution.id });
  }
}

/**
 * Participant-scoped read for the client to resolve an execution:result
 * broadcast — which carries only an id — into the actual output. Returns
 * null for "not found or not yours" rather than distinguishing the two,
 * same reasoning as authorizeInterviewAccess.
 */
export async function getExecutionForParticipant(
  userId: string,
  interviewId: string,
  executionId: string,
): Promise<ExecutionResult | null> {
  const access = await authorizeInterviewAccess(interviewId, userId);
  if (!access) return null;

  const execution = await prisma.execution.findUnique({ where: { id: executionId } });
  if (!execution || execution.interviewId !== interviewId) return null;

  return {
    id: execution.id,
    status: execution.status,
    stdout: execution.stdout,
    stderr: execution.stderr,
    timeMs: execution.timeMs,
    memoryKb: execution.memoryKb,
  };
}
