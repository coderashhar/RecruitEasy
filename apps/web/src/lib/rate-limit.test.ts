import { describe, test, expect, vi, beforeEach } from "vitest";

const executeRaw = vi.fn();
const countHits = vi.fn();
const createHit = vi.fn();
const deleteManyHits = vi.fn();
const calls: string[] = [];

const tx = {
  $executeRaw: (...args: unknown[]) => {
    calls.push("lock");
    return executeRaw(...args);
  },
  rateLimitHit: {
    count: (...args: unknown[]) => {
      calls.push("count");
      return countHits(...args);
    },
    create: (...args: unknown[]) => {
      calls.push("create");
      return createHit(...args);
    },
  },
};

vi.mock("@interviewhub/db", () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
    rateLimitHit: { deleteMany: (...args: unknown[]) => deleteManyHits(...args) },
  },
}));

const { consumeRateLimit, releaseRateLimit, RateLimitError } = await import("./rate-limit.js");

beforeEach(() => {
  calls.length = 0;
  executeRaw.mockReset().mockResolvedValue(1);
  countHits.mockReset().mockResolvedValue(0);
  createHit.mockReset().mockResolvedValue({ id: "hit_1" });
  deleteManyHits.mockReset().mockResolvedValue({ count: 1 });
});

describe("consumeRateLimit", () => {
  test("under the limit: records a hit and reports what is left", async () => {
    countHits.mockResolvedValue(1);

    await expect(consumeRateLimit({ key: "polish:app_1", limit: 3 })).resolves.toEqual({
      hitId: "hit_1",
      remaining: 1,
    });
    expect(createHit).toHaveBeenCalledWith({ data: { key: "polish:app_1" }, select: { id: true } });
  });

  test("at the limit: throws and records nothing", async () => {
    countHits.mockResolvedValue(3);

    await expect(consumeRateLimit({ key: "polish:app_1", limit: 3 })).rejects.toThrow(
      RateLimitError,
    );
    expect(createHit).not.toHaveBeenCalled();
  });

  // The whole guarantee rests on this order: if the count ran before the lock
  // was held, two concurrent callers could both read a count under the limit.
  test("takes the advisory lock on the key before counting", async () => {
    await consumeRateLimit({ key: "practice:user_1", limit: 30, windowMs: 60_000 });

    expect(calls).toEqual(["lock", "count", "create"]);
    const [strings, key] = executeRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(strings.join("?")).toContain("pg_advisory_xact_lock(hashtext(?))");
    expect(key).toBe("practice:user_1");
  });

  test("without a window, counts every hit ever made on the key", async () => {
    await consumeRateLimit({ key: "polish:app_1", limit: 3 });

    expect(countHits).toHaveBeenCalledWith({ where: { key: "polish:app_1" } });
  });

  test("with a window, counts only hits inside it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    try {
      await consumeRateLimit({ key: "practice:user_1", limit: 30, windowMs: 60 * 60 * 1000 });
    } finally {
      vi.useRealTimers();
    }

    expect(countHits).toHaveBeenCalledWith({
      where: {
        key: "practice:user_1",
        createdAt: { gte: new Date("2026-09-13T11:00:00Z") },
      },
    });
  });
});

describe("releaseRateLimit", () => {
  test("deletes by id, tolerating an already-deleted hit", async () => {
    deleteManyHits.mockResolvedValue({ count: 0 });

    await expect(releaseRateLimit("hit_1")).resolves.toBeUndefined();
    expect(deleteManyHits).toHaveBeenCalledWith({ where: { id: "hit_1" } });
  });
});
