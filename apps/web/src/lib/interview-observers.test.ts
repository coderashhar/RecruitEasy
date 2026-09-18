import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstInterview = vi.fn();
const findFirstUser = vi.fn();
const findUniqueParticipant = vi.fn();
const createParticipant = vi.fn();
const deleteManyParticipant = vi.fn();
const createAuditLog = vi.fn();
const notifyUser = vi.fn();

const tx = {
  interviewParticipant: {
    create: (...args: unknown[]) => createParticipant(...args),
    deleteMany: (...args: unknown[]) => deleteManyParticipant(...args),
  },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

vi.mock("@interviewhub/db", () => ({
  prisma: {
    interview: { findFirst: (...args: unknown[]) => findFirstInterview(...args) },
    user: { findFirst: (...args: unknown[]) => findFirstUser(...args) },
    interviewParticipant: { findUnique: (...args: unknown[]) => findUniqueParticipant(...args) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
  },
}));

vi.mock("./notifications", () => ({ notifyUser: (...args: unknown[]) => notifyUser(...args) }));

const { addInterviewObserver, removeInterviewObserver, ObserverError } = await import("./interview-observers.js");

const ORG_ID = "org_1";
const ACTOR_ID = "user_recruiter";
const input = { interviewId: "interview_1", userId: "user_watcher" };

function interview(status: string) {
  return {
    id: "interview_1",
    status,
    application: { candidate: { name: "Ada" }, job: { title: "Engineer" } },
  };
}

beforeEach(() => {
  for (const mock of [
    findFirstInterview,
    findFirstUser,
    findUniqueParticipant,
    createParticipant,
    deleteManyParticipant,
    createAuditLog,
    notifyUser,
  ]) {
    mock.mockReset();
  }
  findFirstInterview.mockResolvedValue(interview("SCHEDULED"));
  findFirstUser.mockResolvedValue({ id: "user_watcher" });
  findUniqueParticipant.mockResolvedValue(null);
  deleteManyParticipant.mockResolvedValue({ count: 1 });
});

describe("addInterviewObserver", () => {
  test("interview outside the caller's org -> rejected before any write", async () => {
    findFirstInterview.mockResolvedValue(null);

    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow(ObserverError);
    expect(findFirstInterview).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "interview_1", application: { job: { orgId: ORG_ID } } } }),
    );
    expect(createParticipant).not.toHaveBeenCalled();
  });

  test("a finished interview can't gain observers", async () => {
    findFirstInterview.mockResolvedValue(interview("COMPLETED"));

    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow("over");
    expect(createParticipant).not.toHaveBeenCalled();
  });

  test("a user from another org, or a candidate account -> rejected", async () => {
    findFirstUser.mockResolvedValue(null);

    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow(ObserverError);
    expect(findFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: ORG_ID, role: { in: ["INTERVIEWER", "RECRUITER", "ADMIN"] } }),
      }),
    );
    expect(createParticipant).not.toHaveBeenCalled();
  });

  test("someone already in the interview, in any role -> rejected", async () => {
    findUniqueParticipant.mockResolvedValue({ role: "INTERVIEWER" });
    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow("already in this interview");

    findUniqueParticipant.mockResolvedValue({ role: "OBSERVER" });
    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow("already observing");
    expect(createParticipant).not.toHaveBeenCalled();
  });

  test("a lost race on the unique index reads as the same friendly error", async () => {
    createParticipant.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    await expect(addInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow(ObserverError);
  });

  test("valid: adds an OBSERVER row and an audit row together, then notifies them", async () => {
    await addInterviewObserver(ORG_ID, ACTOR_ID, input);

    expect(createParticipant).toHaveBeenCalledWith({
      data: { interviewId: "interview_1", userId: "user_watcher", role: "OBSERVER" },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "interview.observer_added", actorId: ACTOR_ID, target: "interview_1" }),
    });
    expect(notifyUser).toHaveBeenCalledWith("user_watcher", expect.objectContaining({ link: "/interview/interview_1" }));
  });
});

describe("removeInterviewObserver", () => {
  test("only deletes OBSERVER rows, so the candidate and panel can't be removed this way", async () => {
    await removeInterviewObserver(ORG_ID, ACTOR_ID, input);

    expect(deleteManyParticipant).toHaveBeenCalledWith({
      where: { interviewId: "interview_1", userId: "user_watcher", role: "OBSERVER" },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "interview.observer_removed" }),
    });
  });

  test("nothing matched -> error, and no audit row for a change that didn't happen", async () => {
    deleteManyParticipant.mockResolvedValue({ count: 0 });

    await expect(removeInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow("aren't observing");
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("a finished interview is left alone", async () => {
    findFirstInterview.mockResolvedValue(interview("CANCELLED"));

    await expect(removeInterviewObserver(ORG_ID, ACTOR_ID, input)).rejects.toThrow(ObserverError);
    expect(deleteManyParticipant).not.toHaveBeenCalled();
  });
});
