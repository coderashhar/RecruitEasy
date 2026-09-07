import { describe, test, expect, vi, beforeEach } from "vitest";
import { createJobSchema, skillsListSchema } from "@interviewhub/types";

const createJob = vi.fn();
const createAuditLog = vi.fn();

const tx = {
  job: { create: (...args: unknown[]) => createJob(...args) },
  auditLog: { create: (...args: unknown[]) => createAuditLog(...args) },
};

vi.mock("@interviewhub/db", () => ({
  prisma: { $transaction: (cb: (tx: unknown) => unknown) => cb(tx) },
}));

const { createJobForOrg } = await import("./jobs.js");

const ORG_ID = "org_1";
const ACTOR_ID = "user_recruiter";

const input = {
  title: "Backend Engineer",
  description: "Build the execution pipeline.",
  requiredSkills: ["TypeScript", "PostgreSQL"],
};

beforeEach(() => {
  createJob.mockReset();
  createAuditLog.mockReset();
  createJob.mockResolvedValue({ id: "job_1", title: input.title });
});

describe("createJobForOrg", () => {
  test("writes the job into the caller's org, never an org from input", async () => {
    await createJobForOrg(ORG_ID, ACTOR_ID, input);

    expect(createJob).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: ORG_ID, title: input.title }),
    });
  });

  test("records who created it, in the same transaction as the job", async () => {
    const result = await createJobForOrg(ORG_ID, ACTOR_ID, input);

    expect(result).toEqual({ id: "job_1", title: input.title });
    expect(createAuditLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG_ID,
        actorId: ACTOR_ID,
        action: "job.created",
        target: "job_1",
      }),
    });
  });
});

describe("createJobSchema", () => {
  test("accepts the comma-separated string the form actually submits", () => {
    const parsed = createJobSchema.parse({
      title: "Backend Engineer",
      description: "Build things.",
      requiredSkills: "TypeScript, PostgreSQL,Docker",
    });

    expect(parsed.requiredSkills).toEqual(["TypeScript", "PostgreSQL", "Docker"]);
  });

  test("accepts a list too, so non-form callers don't have to join and re-split", () => {
    expect(skillsListSchema.parse(["React", "  Vue  "])).toEqual(["React", "Vue"]);
  });

  // The regression this guards: "React, ," would otherwise store an empty
  // string as a skill, which then renders as a stray empty chip and never
  // matches anything during ATS scoring.
  test("drops empty and whitespace-only entries rather than storing them", () => {
    expect(skillsListSchema.parse("React, ,  , Vue,")).toEqual(["React", "Vue"]);
    expect(skillsListSchema.parse("")).toEqual([]);
  });

  test("rejects a blank title or description", () => {
    const base = { description: "d", requiredSkills: "" };
    expect(createJobSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(createJobSchema.safeParse({ title: "t", description: "  ", requiredSkills: "" }).success).toBe(
      false,
    );
  });
});
