import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { supportedLanguageSchema } from "@interviewhub/types";

const authorizeInterviewAccess = vi.fn();
const createExecution = vi.fn();
const updateExecution = vi.fn();
const findUniqueExecution = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    execution: {
      create: (...args: unknown[]) => createExecution(...args),
      update: (...args: unknown[]) => updateExecution(...args),
      findUnique: (...args: unknown[]) => findUniqueExecution(...args),
    },
  },
}));

vi.mock("./interview-access.js", () => ({
  authorizeInterviewAccess: (...args: unknown[]) => authorizeInterviewAccess(...args),
}));

const { submitExecution, getExecutionForParticipant, ExecutionError } = await import(
  "./execution.js"
);

const ORIGINAL_ENV = {
  url: process.env.JUDGE0_URL,
  token: process.env.JUDGE0_AUTH_TOKEN,
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL,
  secret: process.env.REALTIME_JWT_SECRET,
};

const USER_ID = "user_1";
const input = {
  interviewId: "interview_1",
  language: "python" as const,
  source: "print('hi')",
};

function judge0Response(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      stdout: Buffer.from("hi\n").toString("base64"),
      stderr: null,
      compile_output: null,
      status: { id: 3, description: "Accepted" },
      time: "0.012",
      memory: 3456,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  authorizeInterviewAccess.mockReset();
  createExecution.mockReset();
  updateExecution.mockReset();
  findUniqueExecution.mockReset();
  vi.stubGlobal("fetch", vi.fn());

  process.env.JUDGE0_URL = "http://judge0.test";
  process.env.JUDGE0_AUTH_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_REALTIME_URL = "http://realtime.test";
  process.env.REALTIME_JWT_SECRET = "test-secret";

  authorizeInterviewAccess.mockResolvedValue({ participantRole: "CANDIDATE" });
  createExecution.mockResolvedValue({ id: "exec_1" });
  updateExecution.mockImplementation(({ data }) => Promise.resolve({ id: "exec_1", ...data }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.JUDGE0_URL = ORIGINAL_ENV.url;
  process.env.JUDGE0_AUTH_TOKEN = ORIGINAL_ENV.token;
  process.env.NEXT_PUBLIC_REALTIME_URL = ORIGINAL_ENV.realtimeUrl;
  process.env.REALTIME_JWT_SECRET = ORIGINAL_ENV.secret;
});

describe("JUDGE0_LANGUAGE_ID coverage", () => {
  // Not exported directly, so exercised indirectly: every language the
  // schema declares must actually reach Judge0 with some language_id,
  // otherwise this would throw "undefined" into the request body instead
  // of failing at compile time the way the plan intends.
  test("submitExecution sends a language_id for every supported language", async () => {
    for (const language of supportedLanguageSchema.options) {
      vi.mocked(fetch).mockResolvedValue(judge0Response() as unknown as Response);

      await submitExecution(USER_ID, { ...input, language });

      const [, requestInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestInit.body as string);
      expect(typeof body.language_id).toBe("number");

      vi.mocked(fetch).mockClear();
    }
  });
});

describe("submitExecution", () => {
  test("a non-participant is rejected before anything is created", async () => {
    authorizeInterviewAccess.mockResolvedValue(null);

    await expect(submitExecution(USER_ID, input)).rejects.toThrow(ExecutionError);
    expect(createExecution).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a successful run records stdout, timing and memory decoded from base64", async () => {
    vi.mocked(fetch).mockResolvedValue(judge0Response() as unknown as Response);

    const result = await submitExecution(USER_ID, input);

    expect(result).toMatchObject({
      status: "SUCCEEDED",
      stdout: "hi\n",
      timeMs: 12,
      memoryKb: 3456,
    });
  });

  // The regression this guards: Judge0 puts a compile error's message in
  // compile_output, not stderr — a naive read of stderr alone would show an
  // empty output panel for exactly the case a candidate most needs to see.
  test("a compile error surfaces via compile_output when stderr is empty", async () => {
    vi.mocked(fetch).mockResolvedValue(
      judge0Response({
        stderr: null,
        compile_output: Buffer.from("SyntaxError: unexpected token").toString("base64"),
        status: { id: 6, description: "Compilation Error" },
      }) as unknown as Response,
    );

    const result = await submitExecution(USER_ID, input);

    expect(result.status).toBe("FAILED");
    expect(result.stderr).toBe("SyntaxError: unexpected token");
  });

  test("a Judge0 time-limit status is recorded as TIMEOUT", async () => {
    vi.mocked(fetch).mockResolvedValue(
      judge0Response({ status: { id: 5, description: "Time Limit Exceeded" } }) as unknown as Response,
    );

    const result = await submitExecution(USER_ID, input);
    expect(result.status).toBe("TIMEOUT");
  });

  // The regression this guards: an unreachable Judge0 (network error, bad
  // gateway, worker crash) must not surface as an unhandled 500 — it's a
  // FAILED row like any other failed run, visible the same way to everyone.
  test("a Judge0/network failure is recorded as a FAILED execution, not thrown", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const result = await submitExecution(USER_ID, input);

    expect(result.status).toBe("FAILED");
    expect(result.stderr).toMatch(/unavailable/i);
  });

  test("notifies the realtime service's broadcast hook after recording the result", async () => {
    vi.mocked(fetch).mockResolvedValue(judge0Response() as unknown as Response);

    await submitExecution(USER_ID, input);

    const broadcastCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/internal/broadcast"));
    expect(broadcastCall).toBeDefined();

    const [, requestInit] = broadcastCall!;
    expect((requestInit as RequestInit).headers).toMatchObject({
      "x-internal-secret": "test-secret",
    });
    expect(JSON.parse((requestInit as RequestInit).body as string)).toEqual({
      interviewId: "interview_1",
      executionId: "exec_1",
    });
  });

  // Best-effort: a missed broadcast means participants refresh to see the
  // result, not that the result — already committed above — is lost.
  test("a failed broadcast does not fail submitExecution itself", async () => {
    vi.mocked(fetch).mockImplementation((url) =>
      String(url).includes("/internal/broadcast")
        ? Promise.reject(new Error("realtime unreachable"))
        : Promise.resolve(judge0Response() as unknown as Response),
    );

    await expect(submitExecution(USER_ID, input)).resolves.toMatchObject({ status: "SUCCEEDED" });
  });
});

describe("getExecutionForParticipant", () => {
  test("a non-participant gets null, not the execution", async () => {
    authorizeInterviewAccess.mockResolvedValue(null);
    findUniqueExecution.mockResolvedValue({ id: "exec_1", interviewId: "interview_1" });

    await expect(
      getExecutionForParticipant(USER_ID, "interview_1", "exec_1"),
    ).resolves.toBeNull();
  });

  // The regression this guards: authorization here only proves you belong
  // to *an* interview, not that this execution belongs to *that* one — an
  // executionId has to be cross-checked against the interviewId it's
  // fetched under, or a participant of one interview could read another's
  // execution just by guessing its id.
  test("an execution belonging to a different interview is refused", async () => {
    findUniqueExecution.mockResolvedValue({ id: "exec_1", interviewId: "some_other_interview" });

    await expect(
      getExecutionForParticipant(USER_ID, "interview_1", "exec_1"),
    ).resolves.toBeNull();
  });

  test("a participant reading their own interview's execution gets it back", async () => {
    findUniqueExecution.mockResolvedValue({
      id: "exec_1",
      interviewId: "interview_1",
      status: "SUCCEEDED",
      stdout: "hi\n",
      stderr: null,
      timeMs: 12,
      memoryKb: 3456,
    });

    await expect(getExecutionForParticipant(USER_ID, "interview_1", "exec_1")).resolves.toEqual({
      id: "exec_1",
      status: "SUCCEEDED",
      stdout: "hi\n",
      stderr: null,
      timeMs: 12,
      memoryKb: 3456,
    });
  });
});
