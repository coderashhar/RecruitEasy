import { describe, test, expect, vi, beforeEach } from "vitest";

const findManyAuditLog = vi.fn();
const findFirstAuditLog = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    auditLog: {
      findMany: (...args: unknown[]) => findManyAuditLog(...args),
      findFirst: (...args: unknown[]) => findFirstAuditLog(...args),
    },
  },
}));

const { getAuditLogPage, auditTargetHref, AUDIT_PAGE_SIZE } = await import("./audit.js");

beforeEach(() => {
  findManyAuditLog.mockReset().mockResolvedValue([]);
  findFirstAuditLog.mockReset();
});

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `log_${index}` }));
}

describe("getAuditLogPage", () => {
  test("is scoped to the org and applies the filters", async () => {
    await getAuditLogPage("org_1", { action: "application.shortlisted", actorId: "user_1" });

    expect(findManyAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org_1", action: "application.shortlisted", actorId: "user_1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: AUDIT_PAGE_SIZE + 1,
      }),
    );
  });

  test("fetches one extra row to know whether there is a next page", async () => {
    findManyAuditLog.mockResolvedValue(rows(AUDIT_PAGE_SIZE + 1));
    const page = await getAuditLogPage("org_1", {});
    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.nextAfter).toBe(`log_${AUDIT_PAGE_SIZE - 1}`);

    findManyAuditLog.mockResolvedValue(rows(3));
    expect((await getAuditLogPage("org_1", {})).nextAfter).toBeNull();
  });

  test("continues after a cursor row from this org", async () => {
    findFirstAuditLog.mockResolvedValue({ id: "log_9" });
    await getAuditLogPage("org_1", { after: "log_9" });

    expect(findFirstAuditLog).toHaveBeenCalledWith({ where: { id: "log_9", orgId: "org_1" }, select: { id: true } });
    expect(findManyAuditLog).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "log_9" }, skip: 1 }));
  });

  // A cursor is just an id from the URL; one from another org must not seek into its log.
  test("ignores a cursor that belongs to another org", async () => {
    findFirstAuditLog.mockResolvedValue(null);
    await getAuditLogPage("org_1", { after: "log_other_org" });

    const args = findManyAuditLog.mock.calls[0][0];
    expect(args.cursor).toBeUndefined();
    expect(args.where.orgId).toBe("org_1");
  });
});

describe("auditTargetHref", () => {
  test("links records that have a page, and nothing else", () => {
    expect(auditTargetHref("interview.rescheduled", "int_1")).toBe("/recruiter/interviews/int_1");
    expect(auditTargetHref("recording.started", "int_1")).toBe("/recruiter/interviews/int_1");
    expect(auditTargetHref("application.status_changed", "app_1")).toBe("/recruiter/candidates/app_1");
    expect(auditTargetHref("job.created", "job_1")).toBeNull();
    expect(auditTargetHref("application.created", null)).toBeNull();
  });
});
