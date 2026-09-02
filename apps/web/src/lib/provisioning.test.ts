import { describe, test, expect, vi, beforeEach } from "vitest";
import type { User as ClerkUser } from "@clerk/backend";

// provisioning.ts talks to a real Postgres in production. Mocking the client
// keeps these tests about the branch that actually carries risk — which row
// gets matched, and therefore whether two sign-ups collapse into one user —
// rather than about Prisma.
const findFirst = vi.fn();
const update = vi.fn();
const create = vi.fn();
const orgUpsert = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    user: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      update: (...args: unknown[]) => update(...args),
      create: (...args: unknown[]) => create(...args),
    },
    organization: {
      upsert: (...args: unknown[]) => orgUpsert(...args),
    },
  },
}));

const { provisionUser, ensureDefaultOrg, clerkProfile, DEFAULT_ORG_SLUG } = await import(
  "./provisioning.js"
);

function clerkUser(overrides: Partial<ClerkUser> = {}): ClerkUser {
  return {
    id: "user_clerk",
    primaryEmailAddressId: "email_1",
    emailAddresses: [{ id: "email_1", emailAddress: "primary@example.com" }],
    firstName: "Ada",
    lastName: "Lovelace",
    username: null,
    ...overrides,
  } as unknown as ClerkUser;
}

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  create.mockReset();
  orgUpsert.mockReset();
  orgUpsert.mockResolvedValue({ id: "org_1", slug: DEFAULT_ORG_SLUG });
});

describe("ensureDefaultOrg", () => {
  test("upserts on slug so repeated calls never create a second org", async () => {
    await ensureDefaultOrg();
    expect(orgUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: DEFAULT_ORG_SLUG }, update: {} }),
    );
  });
});

describe("provisionUser", () => {
  const input = {
    clerkId: "user_clerk",
    email: "ada@example.com",
    name: "Ada Lovelace",
    role: "CANDIDATE" as const,
  };

  test("first time: creates the user in the default org", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "u1" });

    await provisionUser(input);

    expect(create).toHaveBeenCalledWith({
      data: { ...input, orgId: "org_1" },
    });
    expect(update).not.toHaveBeenCalled();
  });

  test("repeat call: updates the existing row instead of inserting a duplicate", async () => {
    findFirst.mockResolvedValue({ id: "u1" });
    update.mockResolvedValue({ id: "u1" });

    await provisionUser(input);

    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: input });
    expect(create).not.toHaveBeenCalled();
    // No org lookup needed on the hot path — the row already has one.
    expect(orgUpsert).not.toHaveBeenCalled();
  });

  // The regression this guards: `email` and `clerkId` are both unique. Matching
  // on clerkId alone means a deleted-and-recreated Clerk account tries to INSERT
  // and dies on the email index instead of re-claiming its row.
  test("matches on clerkId OR email, so a recreated Clerk account reclaims its row", async () => {
    findFirst.mockResolvedValue({ id: "u1" });
    update.mockResolvedValue({ id: "u1" });

    await provisionUser({ ...input, clerkId: "user_clerk_recreated" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { OR: [{ clerkId: "user_clerk_recreated" }, { email: input.email }] },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ clerkId: "user_clerk_recreated" }),
    });
  });
});

describe("clerkProfile", () => {
  test("prefers the primary email address", () => {
    const profile = clerkProfile(
      clerkUser({
        primaryEmailAddressId: "email_2",
        emailAddresses: [
          { id: "email_1", emailAddress: "old@example.com" },
          { id: "email_2", emailAddress: "primary@example.com" },
        ],
      } as Partial<ClerkUser>),
    );
    expect(profile?.email).toBe("primary@example.com");
  });

  test("falls back to the first address when no primary is set", () => {
    const profile = clerkProfile(clerkUser({ primaryEmailAddressId: null }));
    expect(profile?.email).toBe("primary@example.com");
  });

  test("joins first and last name", () => {
    expect(clerkProfile(clerkUser())?.name).toBe("Ada Lovelace");
  });

  test("falls back to username, then email, when no name is set", () => {
    expect(
      clerkProfile(clerkUser({ firstName: null, lastName: null, username: "ada" }))?.name,
    ).toBe("ada");
    expect(
      clerkProfile(clerkUser({ firstName: null, lastName: null, username: null }))?.name,
    ).toBe("primary@example.com");
  });

  // Returning null here is what stops a placeholder email from being invented —
  // `email` is unique, so every such account would collide on the same value and
  // two people would end up sharing one row.
  test("returns null when the account has no email at all", () => {
    expect(clerkProfile(clerkUser({ emailAddresses: [] }))).toBeNull();
  });
});
