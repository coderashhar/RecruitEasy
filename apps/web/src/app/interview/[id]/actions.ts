"use server";

import { executeRequestSchema } from "@interviewhub/types";
import { ExecutionError, getExecutionForParticipant, submitExecution } from "@/lib/execution";
import { ROLES } from "@/lib/roles";
import { getCurrentUser, requireCurrentUser } from "@/lib/users";

/**
 * Kicks off a Run and returns nothing meaningful once it finishes — the
 * result is not returned to the clicker. Every participant, including
 * whoever clicked Run, learns the outcome through the same path: the
 * execution:result broadcast apps/realtime already emits to everyone in
 * the room, followed by getExecutionResult below. One rendering path for
 * every viewer, rather than a special-cased direct return for the clicker
 * and a second path for everyone else (FR-2.3: visible to all
 * participants, not just whoever ran it).
 */
export async function runCode(formData: FormData) {
  const { user } = await requireCurrentUser(ROLES);

  const parsed = executeRequestSchema.safeParse({
    interviewId: formData.get("interviewId"),
    language: formData.get("language"),
    source: formData.get("source"),
    stdin: formData.get("stdin") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    await submitExecution(user.id, parsed.data);
  } catch (err) {
    if (err instanceof ExecutionError) throw new Error(err.message);
    throw err;
  }
}

/**
 * Called directly from the client's execution:result socket handler, not
 * through a <form> — that broadcast carries only an id, and this resolves
 * it into the actual output. Uses getCurrentUser (returns null), not
 * requireCurrentUser (redirects): a redirect thrown from a background
 * socket callback has no page navigation to make sense of.
 */
export async function getExecutionResult(interviewId: string, executionId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  return getExecutionForParticipant(user.id, interviewId, executionId);
}
