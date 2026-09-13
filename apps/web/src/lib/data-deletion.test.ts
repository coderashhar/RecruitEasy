import { describe, test, expect, vi, beforeEach } from "vitest";

const m = {
  requestFindFirst: vi.fn(),
  requestCreate: vi.fn(),
  requestUpdateMany: vi.fn(),
  userFindMany: vi.fn(),
  userDelete: vi.fn(),
  applicationFindMany: vi.fn(),
  applicationDeleteMany: vi.fn(),
  rateLimitDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
  notifyUser: vi.fn(),
  deleteFile: vi.fn(),
  clerkDeleteUser: vi.fn(),
};
const order: string[] = [];
const track = (name: string, fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
  order.push(name);
  return fn(...args);
};

vi.mock("@interviewhub/db", () => {
  const client = {
    dataDeletionRequest: {
      findFirst: (...a: unknown[]) => m.requestFindFirst(...a),
      create: (...a: unknown[]) => m.requestCreate(...a),
      updateMany: track("request.updateMany", (...a) => m.requestUpdateMany(...a)),
    },
    user: {
      findMany: (...a: unknown[]) => m.userFindMany(...a),
      delete: track("user.delete", (...a) => m.userDelete(...a)),
    },
    application: {
      findMany: (...a: unknown[]) => m.applicationFindMany(...a),
      deleteMany: track("application.deleteMany", (...a) => m.applicationDeleteMany(...a)),
    },
    rateLimitHit: { deleteMany: track("rateLimitHit.deleteMany", (...a) => m.rateLimitDeleteMany(...a)) },
    auditLog: { create: track("auditLog.create", (...a) => m.auditCreate(...a)) },
  };
  return {
    prisma: {
      ...client,
      $transaction: async (cb: (tx: unknown) => unknown) => {
        order.push("tx.begin");
        const result = await cb(client);
        order.push("tx.commit");
        return result;
      },
    },
  };
});
vi.mock("./notifications", () => ({ notifyUser: (...a: unknown[]) => m.notifyUser(...a) }));
vi.mock("./storage", () => ({ deleteFile: track("deleteFile", (...a) => m.deleteFile(...a)) }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { deleteUser: track("clerk.deleteUser", (...a) => m.clerkDeleteUser(...a)) } }),
}));

const { requestDataDeletion, processDeletionRequest, rejectDeletionRequest, DataDeletionError } = await import(
  "./data-deletion.js"
);

const CANDIDATE = { id: "user_c", orgId: "org_1", role: "CANDIDATE" };
const PENDING = {
  id: "req_1",
  orgId: "org_1",
  userId: "user_c",
  status: "PENDING",
  user: { id: "user_c", clerkId: "clerk_c", role: "CANDIDATE" },
};

beforeEach(() => {
  order.length = 0;
  for (const mock of Object.values(m)) mock.mockReset();
  m.requestUpdateMany.mockResolvedValue({ count: 1 });
  m.deleteFile.mockResolvedValue(true);
  m.userFindMany.mockResolvedValue([]);
});

describe("requestDataDeletion", () => {
  test("creates a request and tells every admin in the org", async () => {
    m.requestFindFirst.mockResolvedValue(null);
    m.requestCreate.mockResolvedValue({ id: "req_1" });
    m.userFindMany.mockResolvedValue([{ id: "admin_1" }, { id: "admin_2" }]);

    await requestDataDeletion(CANDIDATE);

    expect(m.requestCreate).toHaveBeenCalledWith({ data: { orgId: "org_1", userId: "user_c" } });
    expect(m.userFindMany).toHaveBeenCalledWith({ where: { orgId: "org_1", role: "ADMIN" }, select: { id: true } });
    expect(m.notifyUser).toHaveBeenCalledTimes(2);
  });

  test("asking again while one is pending returns that one", async () => {
    m.requestFindFirst.mockResolvedValue({ id: "req_1" });
    await expect(requestDataDeletion(CANDIDATE)).resolves.toEqual({ id: "req_1" });
    expect(m.requestCreate).not.toHaveBeenCalled();
  });

  test("staff accounts can't use it", async () => {
    await expect(requestDataDeletion({ ...CANDIDATE, role: "RECRUITER" })).rejects.toThrow(DataDeletionError);
  });
});

describe("processDeletionRequest", () => {
  beforeEach(() => {
    m.requestFindFirst.mockResolvedValue(PENDING);
    m.applicationFindMany.mockResolvedValue([
      {
        id: "app_1",
        resumes: [{ fileKey: "resumes/user_c/job_1.pdf" }],
        interviews: [{ recording: { fileKey: "recordings/int_1/1.mp4" } }, { recording: null }],
      },
    ]);
  });

  test("only a pending request in the admin's own org", async () => {
    m.requestFindFirst.mockResolvedValue(null);
    await expect(processDeletionRequest("org_1", "admin_1", "req_other")).rejects.toThrow(/isn't pending/);
    expect(m.requestFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "req_other", orgId: "org_1", status: "PENDING" } }),
    );
    expect(order).not.toContain("user.delete");
  });

  test("deletes the data in one transaction, then files, then the sign-in identity", async () => {
    const summary = await processDeletionRequest("org_1", "admin_1", "req_1");

    expect(order).toEqual([
      "tx.begin",
      "request.updateMany",
      "rateLimitHit.deleteMany",
      "application.deleteMany",
      "user.delete",
      "auditLog.create",
      "tx.commit",
      "deleteFile",
      "deleteFile",
      "clerk.deleteUser",
    ]);
    expect(m.rateLimitDeleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["practice:user_c", "polish:app_1"] } },
    });
    expect(m.applicationDeleteMany).toHaveBeenCalledWith({ where: { candidateId: "user_c" } });
    expect(m.userDelete).toHaveBeenCalledWith({ where: { id: "user_c" } });
    expect(m.deleteFile).toHaveBeenCalledWith("resumes/user_c/job_1.pdf");
    expect(m.deleteFile).toHaveBeenCalledWith("recordings/int_1/1.mp4");
    expect(m.clerkDeleteUser).toHaveBeenCalledWith("clerk_c");
    // The audit entry says a deletion happened, not who was deleted.
    expect(m.auditCreate).toHaveBeenCalledWith({
      data: {
        orgId: "org_1",
        actorId: "admin_1",
        action: "privacy.data_deleted",
        target: "req_1",
        meta: { applications: 1, files: 2 },
      },
    });
    expect(summary).toEqual({ applications: 1, filesDeleted: 2, filesFailed: [], identityDeleted: true });
  });

  test("two admins at once: the second deletes nothing", async () => {
    m.requestUpdateMany.mockResolvedValue({ count: 0 });

    await expect(processDeletionRequest("org_1", "admin_2", "req_1")).rejects.toThrow(/already processed/);
    expect(order).not.toContain("application.deleteMany");
    expect(order).not.toContain("deleteFile");
  });

  test("files or identity that couldn't be removed are reported, not hidden", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.deleteFile.mockImplementation(async (key: string) => !key.endsWith(".mp4"));
    m.clerkDeleteUser.mockRejectedValue(new Error("clerk down"));

    await expect(processDeletionRequest("org_1", "admin_1", "req_1")).resolves.toEqual({
      applications: 1,
      filesDeleted: 1,
      filesFailed: ["recordings/int_1/1.mp4"],
      identityDeleted: false,
    });
  });

  test("refuses a request whose account isn't a candidate", async () => {
    m.requestFindFirst.mockResolvedValue({ ...PENDING, user: { id: "u", clerkId: "c", role: "ADMIN" } });
    await expect(processDeletionRequest("org_1", "admin_1", "req_1")).rejects.toThrow(/isn't a candidate/);
    expect(order).toEqual([]);
  });
});

describe("rejectDeletionRequest", () => {
  test("needs a reason, records the rejection and tells the candidate", async () => {
    m.requestFindFirst.mockResolvedValue(PENDING);

    await expect(rejectDeletionRequest("org_1", "admin_1", "req_1", " ")).rejects.toThrow(/reason/);

    await rejectDeletionRequest("org_1", "admin_1", "req_1", "An offer is still open under this application.");
    expect(m.requestUpdateMany).toHaveBeenCalledWith({
      where: { id: "req_1", status: "PENDING" },
      data: expect.objectContaining({ status: "REJECTED", reason: "An offer is still open under this application.", processedById: "admin_1" }),
    });
    expect(m.notifyUser).toHaveBeenCalledWith("user_c", expect.objectContaining({ type: "privacy.deletion_rejected" }));
  });
});
