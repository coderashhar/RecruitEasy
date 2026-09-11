import { describe, test, expect, vi, beforeEach } from "vitest";
import type { ScheduleInterviewInput } from "@interviewhub/types";

const findFirstApplication = vi.fn();
const findManyUser = vi.fn();
const findManyParticipant = vi.fn();
const createInterview = vi.fn();
const createAuditLog = vi.fn();

// The transaction callback receives a `tx` client shaped like the outer prisma
// client — proxying straight to the same mocks keeps one set of assertions
// working whether a call happens inside or outside the transaction.
const tx = {
  interview: { create: (...args: unknown[]) => createInterview(...args) },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

vi.mock("@interviewhub/db", () => ({
  prisma: {
    application: { findFirst: (...args: unknown[]) => findFirstApplication(...args) },
    user: { findMany: (...args: unknown[]) => findManyUser(...args) },
    interviewParticipant: { findMany: (...args: unknown[]) => findManyParticipant(...args) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
  },
}));

const { scheduleInterviewForOrg, SchedulingError } = await import("./scheduling.js");

const ORG_ID = "org_1";
const ACTOR_ID = "user_recruiter";

function input(overrides: Partial<ScheduleInterviewInput> = {}): ScheduleInterviewInput {
  return {
    applicationId: "app_1",
    scheduledAt: new Date("2026-10-01T10:00:00Z"),
    durationMins: 60,
    interviewerIds: ["user_interviewer"],
    round: 1,
    ...overrides,
  };
}

beforeEach(() => {
  findFirstApplication.mockReset();
  findManyUser.mockReset();
  findManyParticipant.mockReset();
  findManyParticipant.mockResolvedValue([]); // no conflicts, by default
  createInterview.mockReset();
  createAuditLog.mockReset();
});

describe("scheduleInterviewForOrg", () => {
  test("application not in the caller's org -> rejected before any write", async () => {
    findFirstApplication.mockResolvedValue(null);

    await expect(scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input())).rejects.toThrow(
      SchedulingError,
    );
    // The org filter has to be part of the query itself, not a client-side check
    // applied after the fact.
    expect(findFirstApplication).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_1", job: { orgId: ORG_ID } } }),
    );
    expect(createInterview).not.toHaveBeenCalled();
  });

  // The scenario this guards: a recruiter's form only ever renders interviewers
  // from their own org, but the action is directly invocable — someone could
  // submit an id for a user in a different org, or a CANDIDATE's id, and expect
  // to be waved through.
  test("interviewer id from another org, or missing entirely -> rejected", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    findManyUser.mockResolvedValue([]); // none of the requested ids matched

    await expect(scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input())).rejects.toThrow(
      SchedulingError,
    );
    expect(createInterview).not.toHaveBeenCalled();
  });

  test("a CANDIDATE-role id passed as an interviewer -> rejected", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    // The query itself filters role IN (INTERVIEWER, RECRUITER, ADMIN); a
    // candidate id given as input simply won't come back, which the count
    // check below turns into a rejection.
    findManyUser.mockResolvedValue([]);

    await expect(
      scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input({ interviewerIds: ["candidate_1"] })),
    ).rejects.toThrow(SchedulingError);
  });

  test("valid input: creates the interview, candidate + interviewer participants, and an audit log — all in one transaction", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
    createInterview.mockResolvedValue({ id: "interview_1" });

    const result = await scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input());

    expect(result).toEqual({ id: "interview_1" });
    expect(createInterview).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: "app_1",
        participants: {
          create: [
            { userId: "candidate_1", role: "CANDIDATE" },
            { userId: "user_interviewer", role: "INTERVIEWER" },
          ],
        },
      }),
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: ORG_ID, actorId: ACTOR_ID, target: "interview_1" }),
    });
  });

  test("roomName is unique per call, not derived from applicationId", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
    createInterview.mockResolvedValue({ id: "interview_1" });

    await scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input());
    const firstRoomName = createInterview.mock.calls[0][0].data.roomName;

    createInterview.mockResolvedValue({ id: "interview_2" });
    await scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input());
    const secondRoomName = createInterview.mock.calls[1][0].data.roomName;

    expect(firstRoomName).not.toBe(secondRoomName);
    expect(firstRoomName).not.toContain("app_1");
  });

  test("duplicate interviewer ids are de-duplicated before validation and creation", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
    createInterview.mockResolvedValue({ id: "interview_1" });

    await scheduleInterviewForOrg(
      ORG_ID,
      ACTOR_ID,
      input({ interviewerIds: ["user_interviewer", "user_interviewer"] }),
    );

    expect(findManyUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["user_interviewer"] } }) }),
    );
    const participants = createInterview.mock.calls[0][0].data.participants.create;
    expect(participants).toHaveLength(2); // candidate + one interviewer, not two
  });

  test("round from input is forwarded to the interview create", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
    findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
    createInterview.mockResolvedValue({ id: "interview_1" });

    await scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input({ round: 3 }));

    expect(createInterview).toHaveBeenCalledWith({
      data: expect.objectContaining({ round: 3 }),
    });
  });

  describe("interviewer double-booking", () => {
    test("an interviewer with an overlapping SCHEDULED interview -> rejected", async () => {
      findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
      findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
      // 10:30-11:30 overlaps the requested 10:00-11:00 window.
      findManyParticipant.mockResolvedValue([
        { interview: { scheduledAt: new Date("2026-10-01T10:30:00Z"), durationMins: 60 } },
      ]);

      await expect(scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input())).rejects.toThrow(
        SchedulingError,
      );
      expect(createInterview).not.toHaveBeenCalled();
    });

    test("an interviewer whose existing interview ends exactly when this one starts -> allowed", async () => {
      findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
      findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
      // 09:00-10:00 ends exactly at the requested 10:00 start — back-to-back,
      // not overlapping.
      findManyParticipant.mockResolvedValue([
        { interview: { scheduledAt: new Date("2026-10-01T09:00:00Z"), durationMins: 60 } },
      ]);
      createInterview.mockResolvedValue({ id: "interview_1" });

      await expect(scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input())).resolves.toEqual({
        id: "interview_1",
      });
    });

    test("only SCHEDULED interviews are checked — a CANCELLED slot doesn't block rebooking", async () => {
      findFirstApplication.mockResolvedValue({ id: "app_1", candidateId: "candidate_1" });
      findManyUser.mockResolvedValue([{ id: "user_interviewer" }]);
      createInterview.mockResolvedValue({ id: "interview_1" });

      await scheduleInterviewForOrg(ORG_ID, ACTOR_ID, input());

      // The status filter belongs in the query itself, not a client-side
      // check applied to whatever comes back.
      expect(findManyParticipant).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            interview: expect.objectContaining({ status: "SCHEDULED" }),
          }),
        }),
      );
    });
  });
});
