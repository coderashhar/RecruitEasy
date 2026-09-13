import { describe, test, expect, vi, beforeEach } from "vitest";

const consumeRateLimit = vi.fn();
const releaseRateLimit = vi.fn();
const rateLimitRemaining = vi.fn();
const runOnJudge0 = vi.fn();

class FakeRateLimitError extends Error {}
vi.mock("./rate-limit", () => ({
  RateLimitError: FakeRateLimitError,
  consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
  releaseRateLimit: (...args: unknown[]) => releaseRateLimit(...args),
  rateLimitRemaining: (...args: unknown[]) => rateLimitRemaining(...args),
}));

vi.mock("./judge0", () => ({
  runOnJudge0: (...args: unknown[]) => runOnJudge0(...args),
}));

const { runPracticeCode, practiceRunsRemaining, PracticeError } = await import("./practice.js");

const RUN = { language: "python", source: "print(input())", stdin: "hi" };
const OK = { status: "SUCCEEDED", stdout: "hi\n", stderr: null, timeMs: 12, memoryKb: 3000 };

beforeEach(() => {
  consumeRateLimit.mockReset().mockResolvedValue({ hitId: "hit_1", remaining: 29 });
  releaseRateLimit.mockReset().mockResolvedValue(undefined);
  rateLimitRemaining.mockReset();
  runOnJudge0.mockReset().mockResolvedValue(OK);
});

describe("runPracticeCode", () => {
  test("runs the code and reports what is left of the hour's allowance", async () => {
    await expect(runPracticeCode("user_1", RUN)).resolves.toEqual({ result: OK, remaining: 29 });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: "practice:user_1",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    expect(runOnJudge0).toHaveBeenCalledWith(RUN);
  });

  test("the limit is per candidate", async () => {
    await runPracticeCode("user_2", RUN);
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "practice:user_2" }));
  });

  test("past the limit: refused with a message, and Judge0 is never called", async () => {
    consumeRateLimit.mockRejectedValue(new FakeRateLimitError("limit"));

    await expect(runPracticeCode("user_1", RUN)).rejects.toThrow(PracticeError);
    await expect(runPracticeCode("user_1", RUN)).rejects.toThrow(/all 30 practice runs/);
    expect(runOnJudge0).not.toHaveBeenCalled();
  });

  // Directly invocable Server Action: the shape must be checked, and a bad
  // request must not spend an attempt.
  test("an invalid request is refused before spending an attempt", async () => {
    await expect(runPracticeCode("user_1", { language: "cobol", source: "x" })).rejects.toThrow(
      PracticeError,
    );
    await expect(runPracticeCode("user_1", { language: "python", source: "" })).rejects.toThrow(
      PracticeError,
    );
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });

  test("Judge0 being down shows as a failed run and hands the attempt back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runOnJudge0.mockRejectedValue(new Error("fetch failed"));

    const { result, remaining } = await runPracticeCode("user_1", RUN);

    expect(result.status).toBe("FAILED");
    expect(result.stderr).toMatch(/unavailable/);
    expect(remaining).toBe(30);
    expect(releaseRateLimit).toHaveBeenCalledWith("hit_1");
  });
});

describe("practiceRunsRemaining", () => {
  test("reads the same key and window the limit is enforced with", async () => {
    rateLimitRemaining.mockResolvedValue(12);

    await expect(practiceRunsRemaining("user_1")).resolves.toBe(12);
    expect(rateLimitRemaining).toHaveBeenCalledWith({
      key: "practice:user_1",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
  });
});
