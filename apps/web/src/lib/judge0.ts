import "server-only";

import type { ExecutionStatus, SupportedLanguage } from "@interviewhub/types";

// The Judge0 client, shared by interview Runs (execution.ts) and candidate
// practice (practice.ts). One place owns the language ids, the status mapping
// and the base64 decoding, so the two can't disagree about what a run did.

export interface Judge0RunInput {
  language: SupportedLanguage;
  source: string;
  stdin?: string;
}

/** A finished run, normalised — the columns an Execution row stores. */
export interface Judge0RunResult {
  status: Extract<ExecutionStatus, "SUCCEEDED" | "FAILED" | "TIMEOUT">;
  stdout: string | null;
  stderr: string | null;
  timeMs: number | null;
  memoryKb: number | null;
}

/**
 * Judge0's language_id enum, scoped to exactly the languages
 * supportedLanguageSchema declares. A Record — not a switch or an
 * if-chain — means adding a language to that schema without adding it here
 * is a compile error, not a silent fallback to the wrong compiler at
 * runtime. IDs are from Judge0's own /languages reference; they're stable
 * across versions, since renumbering an existing language would break
 * every other integration against the CE list.
 */
const JUDGE0_LANGUAGE_ID: Record<SupportedLanguage, number> = {
  javascript: 63, // Node.js 12.14.0
  typescript: 74, // TypeScript 3.7.4
  python: 71, // Python 3.8.1
  java: 62, // Java (OpenJDK 13.0.1)
  cpp: 54, // C++ (GCC 9.2.0)
  go: 60, // Go 1.13.5
};

interface Judge0SubmissionResponse {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  status: { id: number; description: string };
  time: string | null; // seconds, as a decimal string
  memory: number | null; // KB
}

// Judge0 status id 3 ("Accepted") is meaningful here only because a Run
// never sends `expected_output` — there's nothing to compare against, so
// this id means "compiled and ran without crashing or hitting a limit",
// not "matched the expected answer".
const JUDGE0_SUCCESS_STATUS_ID = 3;
const JUDGE0_TIMEOUT_STATUS_IDS = new Set([5]); // Time Limit Exceeded

function statusFromJudge0(statusId: number): "SUCCEEDED" | "FAILED" | "TIMEOUT" {
  if (statusId === JUDGE0_SUCCESS_STATUS_ID) return "SUCCEEDED";
  if (JUDGE0_TIMEOUT_STATUS_IDS.has(statusId)) return "TIMEOUT";
  return "FAILED";
}

function decodeBase64(value: string | null): string | null {
  return value ? Buffer.from(value, "base64").toString("utf-8") : null;
}

/**
 * `wait=true` runs synchronously rather than queue-and-poll or configure a
 * callback URL — the simplest correct shape for a single ad-hoc Run click,
 * and ENABLE_WAIT_RESULT is on by Judge0's own default.
 *
 * The timeout is padded past infra/judge0/judge0.conf's own
 * MAX_WALL_TIME_LIMIT (15s): Judge0 itself is what's supposed to cut off a
 * runaway submission, so this only needs to cover network/queueing
 * overhead on top of that, not duplicate the limit.
 */
async function callJudge0(input: Judge0RunInput): Promise<Judge0SubmissionResponse> {
  const url = process.env.JUDGE0_URL;
  const authToken = process.env.JUDGE0_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error("JUDGE0_URL / JUDGE0_AUTH_TOKEN are not set — cannot execute code.");
  }

  const response = await fetch(`${url}/submissions?base64_encoded=true&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Auth-Token": authToken },
    body: JSON.stringify({
      language_id: JUDGE0_LANGUAGE_ID[input.language],
      source_code: Buffer.from(input.source).toString("base64"),
      stdin: input.stdin ? Buffer.from(input.stdin).toString("base64") : undefined,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Judge0 responded ${response.status}`);
  }

  return response.json() as Promise<Judge0SubmissionResponse>;
}

/**
 * Runs code through Judge0 and returns the normalised result.
 *
 * Throws when Judge0 is unconfigured, unreachable or errors — the caller
 * decides what an unavailable service looks like to its user. A program that
 * fails to compile, crashes or times out is not an error here: that is a
 * normal FAILED or TIMEOUT result.
 */
export async function runOnJudge0(input: Judge0RunInput): Promise<Judge0RunResult> {
  const result = await callJudge0(input);
  return {
    status: statusFromJudge0(result.status.id),
    stdout: decodeBase64(result.stdout),
    // A compile error's message arrives in compile_output, not stderr —
    // falling back to it here is what stops a failed compile from showing as
    // an empty output panel.
    stderr: decodeBase64(result.stderr) ?? decodeBase64(result.compile_output),
    timeMs: result.time ? Math.round(parseFloat(result.time) * 1000) : null,
    memoryKb: result.memory,
  };
}
