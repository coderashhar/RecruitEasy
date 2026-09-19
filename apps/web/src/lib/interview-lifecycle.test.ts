import { describe, test, expect, vi, beforeEach } from "vitest";
import type { InterviewStatus } from "@interviewhub/db";

const findFirstInterview = vi.fn();
const findManyParticipant = vi.fn();
const findFirstParticipant = vi.fn();
const updateInterview = vi.fn();
const createAuditLog = vi.fn();
const findInterviewerConflict = vi.fn();

const findUniqueOrThrowInterview = vi.fn();

const tx = {
  interview: {
    updateMany: (...args: unknown[]) => updateInterview(...args),
    findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowInterview(...args),
  },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

vi.mock("@interviewhub/db", () => ({
  prisma: {
    interview: { findFirst: (...args: unknown[]) => findFirstInterview(...args) },
    interviewParticipant: {
      findMany: (...args: unknown[]) => findManyParticipant(...args),
      findFirst: (...args: unknown[]) => findFirstParticipant(...args),
    },
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
  },
}));

const sendInterviewInvites = vi.fn();
const stopActiveRecording = vi.fn();
vi.mock("./recording", () => ({
  stopActiveRecording: (...args: unknown[]) => stopActiveRecording(...args),
}));

const broadcastToRoom = vi.fn();
vi.mock("./realtime-broadcast", () => ({
  broadcastToRoom: (...args: unknown[]) => broadcastToRoom(...args),
}));

vi.mock("./interview-notices", () => ({
  sendInterviewInvites: (...args: unknown[]) => sendInterviewInvites(...args),
}));

// after() needs a live request scope; run the callback inline instead.
vi.mock("next/server", () => ({ after: (callback: () => unknown) => callback() }));

vi.mock("./scheduling.js", () => ({
  findInterviewerConflict: (...args: unknown[]) => findInterviewerConflict(...args),
}));

const { updateInterviewStatus, updateInterviewStatusAsInterviewer, rescheduleInterview, LifecycleError } = await import(
  "./interview-lifecycle.js"
);

const ORG_ID = "org_1";
const ACTOR_ID = "user_recruiter";

function interview(status: InterviewStatus) {
  return {
    id: "interview_1",
    status,
    scheduledAt: new Date("2026-10-01T10:00:00Z"),
    durationMins: 60,
  };
}

beforeEach(() => {
  findFirstInterview.mockReset();
  findManyParticipant.mockReset();
  findFirstParticipant.mockReset();
  updateInterview.mockReset();
  findUniqueOrThrowInterview.mockReset();
  updateInterview.mockResolvedValue({ count: 1 });
  createAuditLog.mockReset();
  findInterviewerConflict.mockReset();
  findInterviewerConflict.mockResolvedValue(false);
  findManyParticipant.mockResolvedValue([{ userId: "user_interviewer" }]);
  sendInterviewInvites.mockReset();
  broadcastToRoom.mockReset();
  stopActiveRecording.mockReset().mockResolvedValue(false);
});

describe("updateInterviewStatusAsInterviewer", () => {
  const ME = "user_interviewer";

  test("an interviewer on the panel can complete it; the seat check is scoped to org and the INTERVIEWER role", async () => {
    findFirstParticipant.mockResolvedValue({ id: "participant_1" });
    findFirstInterview.mockResolvedValue(interview("IN_PROGRESS"));
    findUniqueOrThrowInterview.mockResolvedValue({ ...interview("IN_PROGRESS"), status: "COMPLETED" });

    await updateInterviewStatusAsInterviewer(ORG_ID, ME, { interviewId: "interview_1", status: "COMPLETED" });

    expect(findFirstParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          interviewId: "interview_1",
          userId: ME,
          role: "INTERVIEWER",
          interview: { application: { job: { orgId: ORG_ID } } },
        },
      }),
    );
    expect(updateInterview).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: ME, action: "interview.status_changed" }),
    });
  });

  test("not on this interview's panel (another interviewer, or an observer) -> rejected before any write", async () => {
    findFirstParticipant.mockResolvedValue(null);

    await expect(
      updateInterviewStatusAsInterviewer(ORG_ID, ME, { interviewId: "interview_1", status: "COMPLETED" }),
    ).rejects.toThrow(LifecycleError);
    expect(updateInterview).not.toHaveBeenCalled();
  });

  for (const status of ["CANCELLED", "NO_SHOW", "SCHEDULED"] as const) {
    test(`${status} stays with recruiters, even for someone on the panel`, async () => {
      findFirstParticipant.mockResolvedValue({ id: "participant_1" });

      await expect(
        updateInterviewStatusAsInterviewer(ORG_ID, ME, { interviewId: "interview_1", status }),
      ).rejects.toThrow(LifecycleError);
      expect(findFirstParticipant).not.toHaveBeenCalled();
      expect(updateInterview).not.toHaveBeenCalled();
    });
  }

  test("the ordinary transition rules still apply: a completed interview can't be restarted", async () => {
    findFirstParticipant.mockResolvedValue({ id: "participant_1" });
    findFirstInterview.mockResolvedValue(interview("COMPLETED"));

    await expect(
      updateInterviewStatusAsInterviewer(ORG_ID, ME, { interviewId: "interview_1", status: "IN_PROGRESS" }),
    ).rejects.toThrow(LifecycleError);
    expect(updateInterview).not.toHaveBeenCalled();
  });
});

describe("updateInterviewStatus", () => {
  test("interview not in the caller's org -> rejected", async () => {
    findFirstInterview.mockResolvedValue(null);

    await expect(
      updateInterviewStatus(ORG_ID, ACTOR_ID, { interviewId: "interview_1", status: "COMPLETED" }),
    ).rejects.toThrow(LifecycleError);
    expect(updateInterview).not.toHaveBeenCalled();
  });

  // The transition matrix: every legal move succeeds, every illegal one is
  // rejected before any write. Table-driven so a future change to the matrix
  // has to touch this list, not just the constant.
  const cases: Array<{ from: InterviewStatus; to: InterviewStatus; legal: boolean }> = [
    { from: "SCHEDULED", to: "IN_PROGRESS", legal: true },
    { from: "SCHEDULED", to: "COMPLETED", legal: true },
    { from: "SCHEDULED", to: "CANCELLED", legal: true },
    { from: "SCHEDULED", to: "NO_SHOW", legal: true },
    { from: "IN_PROGRESS", to: "COMPLETED", legal: true },
    { from: "IN_PROGRESS", to: "CANCELLED", legal: true },
    { from: "IN_PROGRESS", to: "SCHEDULED", legal: false },
    { from: "IN_PROGRESS", to: "NO_SHOW", legal: false },
    { from: "COMPLETED", to: "SCHEDULED", legal: false },
    { from: "COMPLETED", to: "IN_PROGRESS", legal: false },
    { from: "CANCELLED", to: "SCHEDULED", legal: false },
    { from: "NO_SHOW", to: "SCHEDULED", legal: false },
  ];

  for (const { from, to, legal } of cases) {
    test(`${from} -> ${to} is ${legal ? "allowed" : "rejected"}`, async () => {
      findFirstInterview.mockResolvedValue(interview(from));
      findUniqueOrThrowInterview.mockResolvedValue({ ...interview(from), status: to });

      const promise = updateInterviewStatus(ORG_ID, ACTOR_ID, {
        interviewId: "interview_1",
        status: to,
      });

      if (legal) {
        await expect(promise).resolves.toMatchObject({ status: to });
        // Anyone already in the room hears about it without reloading.
        expect(broadcastToRoom).toHaveBeenCalledWith({ type: "status", interviewId: "interview_1", status: to });
        // The previously-read status is pinned into the write, so a
        // concurrent transition can't slip past the matrix check.
        expect(updateInterview).toHaveBeenCalledWith({
          where: { id: "interview_1", status: from },
          data: to === "CANCELLED" ? { status: to, icsSequence: { increment: 1 } } : { status: to },
        });
      } else {
        await expect(promise).rejects.toThrow(LifecycleError);
        expect(broadcastToRoom).not.toHaveBeenCalled();
        expect(updateInterview).not.toHaveBeenCalled();
      }
    });
  }

  test("cancelling sends everyone a calendar cancellation; other transitions send nothing", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    findUniqueOrThrowInterview.mockResolvedValue(interview("COMPLETED"));
    await updateInterviewStatus(ORG_ID, ACTOR_ID, { interviewId: "interview_1", status: "COMPLETED" });
    expect(sendInterviewInvites).not.toHaveBeenCalled();

    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    findUniqueOrThrowInterview.mockResolvedValue(interview("CANCELLED"));
    await updateInterviewStatus(ORG_ID, ACTOR_ID, { interviewId: "interview_1", status: "CANCELLED" });
    expect(sendInterviewInvites).toHaveBeenCalledWith("interview_1", "cancelled");
  });

  test("a concurrent transition (0 rows matched) -> rejected, no audit log", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    updateInterview.mockResolvedValue({ count: 0 });

    await expect(
      updateInterviewStatus(ORG_ID, ACTOR_ID, { interviewId: "interview_1", status: "COMPLETED" }),
    ).rejects.toThrow(/changed by someone else/i);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("legal transition records the audit log with from/to", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    findUniqueOrThrowInterview.mockResolvedValue(interview("CANCELLED"));

    await updateInterviewStatus(ORG_ID, ACTOR_ID, {
      interviewId: "interview_1",
      status: "CANCELLED",
    });

    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "interview.status_changed",
        target: "interview_1",
        meta: { from: "SCHEDULED", to: "CANCELLED" },
      }),
    });
  });
});

describe("rescheduleInterview", () => {
  const rescheduleInput = {
    interviewId: "interview_1",
    scheduledAt: new Date("2026-10-02T09:00:00Z"),
    durationMins: 45,
  };

  test("only a SCHEDULED interview can be rescheduled", async () => {
    findFirstInterview.mockResolvedValue(interview("IN_PROGRESS"));

    await expect(rescheduleInterview(ORG_ID, ACTOR_ID, rescheduleInput)).rejects.toThrow(
      LifecycleError,
    );
    expect(updateInterview).not.toHaveBeenCalled();
  });

  test("conflicting reschedule -> rejected, using the interview's own interviewers", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    findInterviewerConflict.mockResolvedValue(true);

    await expect(rescheduleInterview(ORG_ID, ACTOR_ID, rescheduleInput)).rejects.toThrow(
      LifecycleError,
    );
    expect(updateInterview).not.toHaveBeenCalled();
  });

  // The regression this guards: without excluding the interview's own current
  // row, every reschedule would find itself occupying the old slot and reject
  // every reschedule as a false conflict.
  test("excludes the interview's own current booking from the conflict check", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    findUniqueOrThrowInterview.mockResolvedValue({ ...interview("SCHEDULED"), ...rescheduleInput });

    await rescheduleInterview(ORG_ID, ACTOR_ID, rescheduleInput);

    expect(findInterviewerConflict).toHaveBeenCalledWith(
      ["user_interviewer"],
      rescheduleInput.scheduledAt,
      rescheduleInput.durationMins,
      "interview_1",
    );
  });

  test("a concurrent change (0 rows matched) -> rejected, no audit log", async () => {
    findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
    updateInterview.mockResolvedValue({ count: 0 });

    await expect(rescheduleInterview(ORG_ID, ACTOR_ID, rescheduleInput)).rejects.toThrow(
      /changed by someone else/i,
    );
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("valid reschedule: updates the time and records before/after in the audit log", async () => {
    const before = interview("SCHEDULED");
    findFirstInterview.mockResolvedValue(before);
    findUniqueOrThrowInterview.mockResolvedValue({ ...before, ...rescheduleInput });

    const result = await rescheduleInterview(ORG_ID, ACTOR_ID, rescheduleInput);

    expect(result).toMatchObject(rescheduleInput);
    expect(updateInterview).toHaveBeenCalledWith({
      where: { id: "interview_1", status: "SCHEDULED" },
      data: {
        scheduledAt: rescheduleInput.scheduledAt,
        durationMins: rescheduleInput.durationMins,
        icsSequence: { increment: 1 },
        reminder24hSentAt: null,
        reminder1hSentAt: null,
      },
    });
    expect(sendInterviewInvites).toHaveBeenCalledWith("interview_1", "rescheduled");
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "interview.rescheduled",
        target: "interview_1",
        meta: {
          from: { scheduledAt: before.scheduledAt, durationMins: before.durationMins },
          to: { scheduledAt: rescheduleInput.scheduledAt, durationMins: rescheduleInput.durationMins },
        },
      }),
    });
  });
});
