import { describe, test, expect, vi, beforeEach } from "vitest";

const authorizeInterviewAccess = vi.fn();
const broadcastToRoom = vi.fn();
const getSignedDownloadUrl = vi.fn();
const startRoomCompositeEgress = vi.fn();
const stopEgress = vi.fn();

const findUniqueRecording = vi.fn();
const findFirstRecording = vi.fn();
const upsertRecording = vi.fn();
const updateManyRecording = vi.fn();
const updateRecording = vi.fn();
const createAuditLog = vi.fn();
const findUniqueInterview = vi.fn();

vi.mock("@interviewhub/db", () => {
  const recording = {
    findUnique: (...args: unknown[]) => findUniqueRecording(...args),
    findFirst: (...args: unknown[]) => findFirstRecording(...args),
    upsert: (...args: unknown[]) => upsertRecording(...args),
    updateMany: (...args: unknown[]) => updateManyRecording(...args),
    update: (...args: unknown[]) => updateRecording(...args),
  };
  const auditLog = { create: (...args: unknown[]) => createAuditLog(...args) };
  return {
    prisma: {
      recording,
      auditLog,
      interview: { findUnique: (...args: unknown[]) => findUniqueInterview(...args) },
      $transaction: (cb: (tx: unknown) => unknown) => cb({ recording, auditLog }),
    },
  };
});

enum FakeEgressStatus {
  EGRESS_STARTING = 0,
  EGRESS_ACTIVE = 1,
  EGRESS_ENDING = 2,
  EGRESS_COMPLETE = 3,
  EGRESS_FAILED = 4,
  EGRESS_ABORTED = 5,
  EGRESS_LIMIT_REACHED = 6,
}

vi.mock("livekit-server-sdk", () => ({
  EgressClient: class {
    constructor(public host: string) {}
    startRoomCompositeEgress = (...args: unknown[]) => startRoomCompositeEgress(...args);
    stopEgress = (...args: unknown[]) => stopEgress(...args);
  },
  EgressStatus: FakeEgressStatus,
  EncodedFileType: { MP4: 1 },
  EncodedFileOutput: class {
    constructor(public init: Record<string, unknown>) {}
  },
  S3Upload: class {
    constructor(public init: Record<string, unknown>) {}
  },
  WebhookReceiver: class {},
}));

vi.mock("./interview-access", () => ({
  authorizeInterviewAccess: (...args: unknown[]) => authorizeInterviewAccess(...args),
}));
vi.mock("./realtime-broadcast", () => ({
  broadcastToRoom: (...args: unknown[]) => broadcastToRoom(...args),
}));
vi.mock("./storage", () => ({
  r2UploadTarget: () => ({
    accessKey: "ak",
    secret: "sk",
    endpoint: "https://acct.r2.cloudflarestorage.com",
    region: "auto",
    bucket: "bucket",
  }),
  getSignedDownloadUrl: (...args: unknown[]) => getSignedDownloadUrl(...args),
}));

vi.stubEnv("LIVEKIT_API_KEY", "key");
vi.stubEnv("LIVEKIT_API_SECRET", "secret");
vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", "wss://project.livekit.cloud");

const {
  startRecording,
  stopRecording,
  stopActiveRecording,
  applyEgressEvent,
  getRecordingForReview,
  describeStartFailure,
  roomStateFor,
  RecordingError,
} = await import("./recording.js");

const INTERVIEW = { id: "interview_1", roomName: "interview_room_1", status: "IN_PROGRESS" };

function access(role: "INTERVIEWER" | "CANDIDATE" = "INTERVIEWER", status = "IN_PROGRESS") {
  return { interview: { ...INTERVIEW, status }, participantRole: role };
}

function egressInfo(overrides: Record<string, unknown> = {}) {
  return {
    egressId: "EG_1",
    status: FakeEgressStatus.EGRESS_COMPLETE,
    error: "",
    fileResults: [{ size: BigInt(1024), duration: BigInt(125_000_000_000) }],
    ...overrides,
  } as never;
}

beforeEach(() => {
  for (const mock of [
    authorizeInterviewAccess,
    broadcastToRoom,
    getSignedDownloadUrl,
    startRoomCompositeEgress,
    stopEgress,
    findUniqueRecording,
    findFirstRecording,
    upsertRecording,
    updateManyRecording,
    updateRecording,
    createAuditLog,
    findUniqueInterview,
  ]) {
    mock.mockReset();
  }
  authorizeInterviewAccess.mockResolvedValue(access());
  findUniqueRecording.mockResolvedValue(null);
  startRoomCompositeEgress.mockResolvedValue({ egressId: "EG_1" });
  findUniqueInterview.mockResolvedValue({ application: { job: { orgId: "org_1" } } });
  updateManyRecording.mockResolvedValue({ count: 1 });
});

describe("startRecording", () => {
  test("only the interview's interviewer can start it", async () => {
    authorizeInterviewAccess.mockResolvedValue(access("CANDIDATE"));
    await expect(startRecording("user_c", "interview_1")).rejects.toThrow(/Only this interview's interviewer/);

    authorizeInterviewAccess.mockResolvedValue(null);
    await expect(startRecording("user_x", "interview_1")).rejects.toThrow(RecordingError);
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  test("a finished interview can't be recorded", async () => {
    authorizeInterviewAccess.mockResolvedValue(access("INTERVIEWER", "COMPLETED"));
    await expect(startRecording("user_i", "interview_1")).rejects.toThrow(/completed/);
  });

  test("one recording per interview: refused while one runs or once one is saved", async () => {
    findUniqueRecording.mockResolvedValue({ status: "PENDING" });
    await expect(startRecording("user_i", "interview_1")).rejects.toThrow(/already being recorded/);

    findUniqueRecording.mockResolvedValue({ status: "READY" });
    await expect(startRecording("user_i", "interview_1")).rejects.toThrow(/already has a recording/);
    expect(startRoomCompositeEgress).not.toHaveBeenCalled();
  });

  test("starts a composite MP4 egress into R2, stores it, audits it and tells the room", async () => {
    await expect(startRecording("user_i", "interview_1")).resolves.toBe("recording");

    const [roomName, output, options] = startRoomCompositeEgress.mock.calls[0] as [
      string,
      { init: { fileType: number; filepath: string; output: { case: string; value: { init: Record<string, unknown> } } } },
      unknown,
    ];
    expect(roomName).toBe("interview_room_1");
    expect(output.init.fileType).toBe(1);
    expect(output.init.filepath).toMatch(/^recordings\/interview_1\/\d+\.mp4$/);
    expect(output.init.output.case).toBe("s3");
    expect(output.init.output.value.init).toMatchObject({ bucket: "bucket", forcePathStyle: true });
    expect(options).toEqual({ layout: "speaker" });

    expect(upsertRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { interviewId: "interview_1" },
        update: expect.objectContaining({ egressId: "EG_1", status: "PENDING", error: null }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org_1", actorId: "user_i", action: "recording.started" }),
    });
    expect(broadcastToRoom).toHaveBeenCalledWith({ type: "recording", interviewId: "interview_1", state: "recording" });
  });

  // Free plan: quotas are a hard stop, and the interviewer needs to know why.
  test("a refused recording becomes a readable error, with no vendor detail, and nothing is stored", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    startRoomCompositeEgress.mockRejectedValue(Object.assign(new Error("egress limit exceeded"), { code: "resource_exhausted", status: 429 }));

    await expect(startRecording("user_i", "interview_1")).rejects.toThrow(/monthly limit has been reached/);
    // The interviewer is told what it means for them, not which vendor refused.
    await expect(startRecording("user_i", "interview_1")).rejects.not.toThrow(/LiveKit|egress|API key/i);
    expect(upsertRecording).not.toHaveBeenCalled();
    expect(broadcastToRoom).not.toHaveBeenCalled();
  });
});

describe("describeStartFailure", () => {
  test("names the likely cause", () => {
    expect(describeStartFailure({ code: "not_found", status: 404, message: "room does not exist" })).toMatch(
      /Join the video call first/,
    );
    expect(describeStartFailure({ status: 403 })).toMatch(/refused for this room/);
    expect(describeStartFailure(new Error("boom"))).toMatch(/couldn't start/);
  });
});

describe("stopping", () => {
  test("stopRecording is the interviewer's, and reports when nothing is running", async () => {
    authorizeInterviewAccess.mockResolvedValue(access("CANDIDATE"));
    await expect(stopRecording("user_c", "interview_1")).rejects.toThrow(RecordingError);

    authorizeInterviewAccess.mockResolvedValue(access());
    findUniqueRecording.mockResolvedValue({ status: "READY" });
    await expect(stopRecording("user_i", "interview_1")).rejects.toThrow(/Nothing is being recorded/);
  });

  test("stops the egress, marks it saving, and tells the room", async () => {
    findUniqueRecording.mockResolvedValue({ id: "rec_1", status: "PENDING", egressId: "EG_1" });

    await expect(stopActiveRecording("interview_1", null)).resolves.toBe(true);
    expect(stopEgress).toHaveBeenCalledWith("EG_1");
    expect(updateManyRecording).toHaveBeenCalledWith({
      where: { id: "rec_1", status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "recording.stopped", actorId: null, meta: { automatic: true } }),
    });
    expect(broadcastToRoom).toHaveBeenCalledWith({ type: "recording", interviewId: "interview_1", state: "processing" });
  });

  // The egress may already have ended (room emptied, limit hit); its webhook settles the row.
  test("an egress that already ended doesn't make stopping fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findUniqueRecording.mockResolvedValue({ id: "rec_1", status: "PENDING", egressId: "EG_1" });
    stopEgress.mockRejectedValue(new Error("egress not active"));

    await expect(stopActiveRecording("interview_1", "user_i")).resolves.toBe(true);
  });

  test("nothing running: no LiveKit call", async () => {
    findUniqueRecording.mockResolvedValue(null);
    await expect(stopActiveRecording("interview_1", null)).resolves.toBe(false);
    expect(stopEgress).not.toHaveBeenCalled();
  });
});

describe("applyEgressEvent", () => {
  test("a completed egress marks the recording ready with its duration", async () => {
    findUniqueRecording.mockResolvedValue({ id: "rec_1", interviewId: "interview_1", status: "PROCESSING" });

    await applyEgressEvent("egress_ended", egressInfo());

    expect(updateRecording).toHaveBeenCalledWith({
      where: { id: "rec_1" },
      data: { status: "READY", durationSec: 125, error: null },
    });
    expect(broadcastToRoom).toHaveBeenCalledWith({ type: "recording", interviewId: "interview_1", state: "ready" });
  });

  test("hitting the plan's limit keeps a usable file, with a note saying it was cut short", async () => {
    findUniqueRecording.mockResolvedValue({ id: "rec_1", interviewId: "interview_1", status: "PENDING" });

    await applyEgressEvent("egress_ended", egressInfo({ status: FakeEgressStatus.EGRESS_LIMIT_REACHED }));

    expect(updateRecording).toHaveBeenCalledWith({
      where: { id: "rec_1" },
      data: expect.objectContaining({ status: "READY", error: expect.stringMatching(/stopped at the monthly limit/) }),
    });
  });

  test("a failed egress marks it failed and tells the room why", async () => {
    findUniqueRecording.mockResolvedValue({ id: "rec_1", interviewId: "interview_1", status: "PENDING" });

    await applyEgressEvent(
      "egress_ended",
      egressInfo({ status: FakeEgressStatus.EGRESS_FAILED, fileResults: [], error: "upload denied" }),
    );

    expect(updateRecording).toHaveBeenCalledWith({
      where: { id: "rec_1" },
      data: { status: "FAILED", error: "The recording couldn't be produced." },
    });
    expect(broadcastToRoom).toHaveBeenCalledWith(
      expect.objectContaining({ state: "failed", message: "The recording couldn't be produced." }),
    );
  });

  // LiveKit retries webhooks.
  test("a repeated or irrelevant event changes nothing", async () => {
    findUniqueRecording.mockResolvedValue({ id: "rec_1", interviewId: "interview_1", status: "READY" });
    await applyEgressEvent("egress_ended", egressInfo());

    await applyEgressEvent("egress_started", egressInfo());
    findUniqueRecording.mockResolvedValue(null);
    await applyEgressEvent("egress_ended", egressInfo({ egressId: "EG_unknown" }));

    expect(updateRecording).not.toHaveBeenCalled();
  });
});

describe("getRecordingForReview", () => {
  test("is org-scoped, and only a ready recording gets a playback link", async () => {
    findFirstRecording.mockResolvedValue({ status: "PROCESSING", fileKey: "recordings/x.mp4", durationSec: null, error: null });
    await expect(getRecordingForReview("org_1", "interview_1")).resolves.toMatchObject({ playbackUrl: null });
    expect(findFirstRecording).toHaveBeenCalledWith({
      where: { interviewId: "interview_1", interview: { application: { job: { orgId: "org_1" } } } },
    });

    findFirstRecording.mockResolvedValue({ status: "READY", fileKey: "recordings/x.mp4", durationSec: 60, error: null });
    getSignedDownloadUrl.mockResolvedValue("https://signed");
    await expect(getRecordingForReview("org_1", "interview_1")).resolves.toMatchObject({ playbackUrl: "https://signed" });
    expect(getSignedDownloadUrl).toHaveBeenCalledWith("recordings/x.mp4", 900);
  });
});

describe("roomStateFor", () => {
  test("maps stored status to what the room shows", () => {
    expect(roomStateFor(null)).toBe("idle");
    expect(roomStateFor({ status: "PENDING" })).toBe("recording");
    expect(roomStateFor({ status: "PROCESSING" })).toBe("processing");
  });
});
