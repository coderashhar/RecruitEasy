import { describe, test, expect, vi, beforeEach } from "vitest";

const findManyRecording = vi.fn();
const updateManyRecording = vi.fn();
const deleteManyHits = vi.fn();
const deleteFile = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    recording: {
      findMany: (...args: unknown[]) => findManyRecording(...args),
      updateMany: (...args: unknown[]) => updateManyRecording(...args),
    },
    rateLimitHit: { deleteMany: (...args: unknown[]) => deleteManyHits(...args) },
  },
}));
vi.mock("./storage", () => ({ deleteFile: (...args: unknown[]) => deleteFile(...args) }));

const { runRetention, recordingRetentionDays } = await import("./retention.js");

const NOW = new Date("2026-09-14T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.unstubAllEnvs();
  findManyRecording.mockReset().mockResolvedValue([]);
  updateManyRecording.mockReset().mockResolvedValue({ count: 1 });
  deleteManyHits.mockReset().mockResolvedValue({ count: 0 });
  deleteFile.mockReset().mockResolvedValue(true);
});

describe("recordingRetentionDays", () => {
  test("a positive whole number of days, otherwise off", () => {
    expect(recordingRetentionDays("90")).toBe(90);
    expect(recordingRetentionDays(undefined)).toBeNull();
    expect(recordingRetentionDays("0")).toBeNull();
    expect(recordingRetentionDays("30.5")).toBeNull();
    expect(recordingRetentionDays("ninety")).toBeNull();
  });
});

describe("runRetention", () => {
  // Deleting recordings is irreversible; it must be opted into.
  test("with no retention period set, no recording is touched", async () => {
    await runRetention(NOW);
    expect(findManyRecording).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  test("deletes files older than the period and marks their rows expired", async () => {
    vi.stubEnv("RECORDING_RETENTION_DAYS", "90");
    findManyRecording.mockResolvedValue([{ id: "rec_1", fileKey: "recordings/a.mp4" }]);

    await expect(runRetention(NOW)).resolves.toEqual({
      recordingsExpired: 1,
      recordingsFailedToDelete: 0,
      rateLimitHitsDeleted: 0,
    });
    expect(findManyRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["READY", "FAILED"] },
          fileKey: { not: null },
          updatedAt: { lt: new Date(NOW.getTime() - 90 * DAY) },
        },
      }),
    );
    expect(deleteFile).toHaveBeenCalledWith("recordings/a.mp4");
    expect(updateManyRecording).toHaveBeenCalledWith({
      where: { id: "rec_1", fileKey: "recordings/a.mp4" },
      data: expect.objectContaining({ status: "EXPIRED", fileKey: null }),
    });
  });

  test("a file storage refuses to delete keeps its row, for the next sweep", async () => {
    vi.stubEnv("RECORDING_RETENTION_DAYS", "30");
    findManyRecording.mockResolvedValue([{ id: "rec_1", fileKey: "recordings/a.mp4" }]);
    deleteFile.mockResolvedValue(false);

    const result = await runRetention(NOW);
    expect(result.recordingsFailedToDelete).toBe(1);
    expect(updateManyRecording).not.toHaveBeenCalled();
  });

  // Polish limits are lifetime caps: sweeping them would give attempts back.
  test("sweeps only practice-run counters, and only once they're a day old", async () => {
    deleteManyHits.mockResolvedValue({ count: 12 });

    expect((await runRetention(NOW)).rateLimitHitsDeleted).toBe(12);
    expect(deleteManyHits).toHaveBeenCalledWith({
      where: { key: { startsWith: "practice:" }, createdAt: { lt: new Date(NOW.getTime() - DAY) } },
    });
  });
});
