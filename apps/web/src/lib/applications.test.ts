import { describe, test, expect, vi, beforeEach } from "vitest";

const findFirstJob = vi.fn();
const findFirstUser = vi.fn();
const findFirstApplication = vi.fn();
const createApplication = vi.fn();
const updateApplication = vi.fn();
const createAuditLog = vi.fn();

const findUniqueOrThrowApplication = vi.fn();

const tx = {
  application: {
    create: (...args: unknown[]) => createApplication(...args),
    updateMany: (...args: unknown[]) => updateApplication(...args),
    findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowApplication(...args),
  },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

// Mirrors Prisma's real error shape closely enough for the `instanceof` + code
// check in applications.ts, without pulling in the generated client.
class FakeKnownRequestError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

vi.mock("@interviewhub/db", () => ({
  Prisma: { PrismaClientKnownRequestError: FakeKnownRequestError },
  prisma: {
    job: { findFirst: (...args: unknown[]) => findFirstJob(...args) },
    user: { findFirst: (...args: unknown[]) => findFirstUser(...args) },
    application: { findFirst: (...args: unknown[]) => findFirstApplication(...args) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
  },
}));

const { createApplicationForOrg, updateApplicationStatus, ApplicationError } = await import(
  "./applications.js"
);

const ORG_ID = "org_1";
const ACTOR_ID = "user_recruiter";
const input = { jobId: "job_1", candidateId: "candidate_1" };

beforeEach(() => {
  findFirstJob.mockReset();
  findFirstUser.mockReset();
  findFirstApplication.mockReset();
  createApplication.mockReset();
  updateApplication.mockReset();
  findUniqueOrThrowApplication.mockReset();
  createAuditLog.mockReset();

  findFirstJob.mockResolvedValue({ id: "job_1" });
  findFirstUser.mockResolvedValue({ id: "candidate_1" });
  createApplication.mockResolvedValue({ id: "app_1" });
});

describe("createApplicationForOrg", () => {
  test("job from another org -> rejected before any write", async () => {
    findFirstJob.mockResolvedValue(null);

    await expect(createApplicationForOrg(ORG_ID, ACTOR_ID, input)).rejects.toThrow(
      ApplicationError,
    );
    expect(createApplication).not.toHaveBeenCalled();
    // The org filter has to be in the query, not applied after the fact.
    expect(findFirstJob).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job_1", orgId: ORG_ID } }),
    );
  });

  test("candidate from another org, or not found -> rejected", async () => {
    findFirstUser.mockResolvedValue(null);

    await expect(createApplicationForOrg(ORG_ID, ACTOR_ID, input)).rejects.toThrow(
      ApplicationError,
    );
    expect(createApplication).not.toHaveBeenCalled();
  });

  // The scenario: a recruiter's own id submitted where a candidate is expected.
  // The role filter is part of the query, so a non-candidate simply doesn't
  // come back and the null check above rejects it.
  test("only a CANDIDATE-role user may be attached to an application", async () => {
    await createApplicationForOrg(ORG_ID, ACTOR_ID, input);

    expect(findFirstUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "candidate_1", orgId: ORG_ID, role: "CANDIDATE" },
      }),
    );
  });

  test("valid input: creates the application and its audit log in one transaction", async () => {
    const result = await createApplicationForOrg(ORG_ID, ACTOR_ID, input);

    expect(result).toEqual({ id: "app_1" });
    expect(createApplication).toHaveBeenCalledWith({
      data: { jobId: "job_1", candidateId: "candidate_1" },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        actorId: ACTOR_ID,
        action: "application.created",
        target: "app_1",
      }),
    });
  });

  // Relies on the unique index rather than a pre-flight existence check, so
  // two concurrent submits can't both pass the check and both insert.
  test("duplicate application -> a readable error, not a raw Prisma P2002", async () => {
    createApplication.mockRejectedValue(new FakeKnownRequestError("P2002"));

    await expect(createApplicationForOrg(ORG_ID, ACTOR_ID, input)).rejects.toThrow(
      /already applied/i,
    );
  });

  test("an unrelated database error is not swallowed as a duplicate", async () => {
    createApplication.mockRejectedValue(new FakeKnownRequestError("P1001"));

    await expect(createApplicationForOrg(ORG_ID, ACTOR_ID, input)).rejects.not.toThrow(
      ApplicationError,
    );
  });
});

describe("updateApplicationStatus", () => {
  const statusInput = { applicationId: "app_1", status: "OFFER" as const };

  beforeEach(() => {
    findFirstApplication.mockResolvedValue({ id: "app_1", status: "INTERVIEWING" });
    updateApplication.mockResolvedValue({ count: 1 });
    findUniqueOrThrowApplication.mockResolvedValue({ id: "app_1", status: "OFFER" });
  });

  test("application from another org -> rejected before any write", async () => {
    findFirstApplication.mockResolvedValue(null);

    await expect(updateApplicationStatus(ORG_ID, ACTOR_ID, statusInput)).rejects.toThrow(
      ApplicationError,
    );
    expect(updateApplication).not.toHaveBeenCalled();
    // The org filter reaches through the job relation, not a client-side check.
    expect(findFirstApplication).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app_1", job: { orgId: ORG_ID } } }),
    );
  });

  test("valid input: updates the status and records the transition in one audit log", async () => {
    const result = await updateApplicationStatus(ORG_ID, ACTOR_ID, statusInput);

    expect(result).toEqual({ id: "app_1", status: "OFFER" });
    // Pins the previous status into the write so a concurrent change can't
    // leave the audit log recording a transition that never happened.
    expect(updateApplication).toHaveBeenCalledWith({
      where: { id: "app_1", status: "INTERVIEWING" },
      data: { status: "OFFER" },
    });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        actorId: ACTOR_ID,
        action: "application.status_changed",
        target: "app_1",
        meta: { from: "INTERVIEWING", to: "OFFER" },
      }),
    });
  });

  // Deliberately no transition-matrix test: any status to any other is a
  // legitimate recruiter correction, unlike the interview lifecycle's real
  // transition constraints.
  test("a concurrent change (0 rows matched) -> rejected, no audit log written", async () => {
    updateApplication.mockResolvedValue({ count: 0 });

    await expect(updateApplicationStatus(ORG_ID, ACTOR_ID, statusInput)).rejects.toThrow(
      /changed by someone else/i,
    );
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test("moving backwards (e.g. REJECTED -> SCREENING) is allowed", async () => {
    findFirstApplication.mockResolvedValue({ id: "app_1", status: "REJECTED" });
    updateApplication.mockResolvedValue({ count: 1 });
    findUniqueOrThrowApplication.mockResolvedValue({ id: "app_1", status: "SCREENING" });

    await expect(
      updateApplicationStatus(ORG_ID, ACTOR_ID, { applicationId: "app_1", status: "SCREENING" }),
    ).resolves.toEqual({ id: "app_1", status: "SCREENING" });
  });
});
