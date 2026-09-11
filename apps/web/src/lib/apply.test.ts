import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const findFirstJob = vi.fn();
const findFirstUser = vi.fn();
const createApplication = vi.fn();
const createResume = vi.fn();
const createAuditLog = vi.fn();

const tx = {
  application: { create: (...args: unknown[]) => createApplication(...args) },
  resume: { create: (...args: unknown[]) => createResume(...args) },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

vi.mock("@interviewhub/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
  prisma: {
    job: { findFirst: (...args: unknown[]) => findFirstJob(...args) },
    user: { findFirst: (...args: unknown[]) => findFirstUser(...args) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
  },
}));

vi.mock("./resume-parser", () => ({
  parseResume: vi.fn().mockResolvedValue({
    text: "Experienced engineer with TypeScript skills.",
    extension: "pdf",
    buffer: Buffer.from("fake-pdf"),
  }),
  ResumeParseError: class extends Error {},
}));

vi.mock("./storage", () => ({
  uploadFile: vi.fn().mockResolvedValue("resumes/user_1/job_1.pdf"),
}));

const { applyToJob, ApplyError } = await import("./apply.js");

const USER_ID = "user_1";
const ORG_ID = "org_1";
const JOB_ID = "job_1";

function makeFakeFile() {
  return new File([new Uint8Array(100)], "resume.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  findFirstJob.mockReset();
  findFirstUser.mockReset();
  createApplication.mockReset();
  createResume.mockReset();
  createAuditLog.mockReset();

  findFirstJob.mockResolvedValue({ id: JOB_ID });
  findFirstUser.mockResolvedValue({ id: USER_ID });
  createApplication.mockResolvedValue({ id: "app_1" });
  createResume.mockResolvedValue({ id: "resume_1" });
});

describe("applyToJob", () => {
  test("creates application and resume in one transaction", async () => {
    const result = await applyToJob(USER_ID, ORG_ID, JOB_ID, makeFakeFile());

    expect(result).toEqual({ applicationId: "app_1", resumeId: "resume_1" });
    expect(createApplication).toHaveBeenCalledWith({
      data: { jobId: JOB_ID, candidateId: USER_ID },
    });
    expect(createResume).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: "app_1",
        uploadedById: USER_ID,
        parsedText: expect.any(String),
      }),
    });
  });

  test("writes an audit log entry", async () => {
    await applyToJob(USER_ID, ORG_ID, JOB_ID, makeFakeFile());

    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        actorId: USER_ID,
        action: "application.created",
      }),
    });
  });

  test("rejects when job not found in org", async () => {
    findFirstJob.mockResolvedValue(null);

    await expect(applyToJob(USER_ID, ORG_ID, JOB_ID, makeFakeFile())).rejects.toThrow(
      "Job not found",
    );
  });

  test("rejects when user is not a candidate", async () => {
    findFirstUser.mockResolvedValue(null);

    await expect(applyToJob(USER_ID, ORG_ID, JOB_ID, makeFakeFile())).rejects.toThrow(
      "Only candidates can apply",
    );
  });

  test("rejects duplicate application with P2002", async () => {
    const { Prisma } = await import("@interviewhub/db");
    createApplication.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "6.0.0",
      }),
    );

    await expect(applyToJob(USER_ID, ORG_ID, JOB_ID, makeFakeFile())).rejects.toThrow(
      "already applied",
    );
  });
});
