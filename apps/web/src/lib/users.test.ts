import { describe, test, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const getUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  clerkClient: async () => ({ users: { getUser: (id: string) => getUser(id) } }),
}));

const findUnique = vi.fn();
vi.mock("@interviewhub/db", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const provisionUser = vi.fn();
vi.mock("./provisioning.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provisioning.js")>()),
  provisionUser: (...args: unknown[]) => provisionUser(...args),
}));

// Matches auth.test.ts: redirect() throws in real Next.js rather than returning,
// so tests that let execution continue past one would be testing a path Next
// never permits.
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirectMock(path) }));

const { getCurrentUser, requireCurrentUser } = await import("./users.js");

function clerkUserWithEmail(email: string) {
  return {
    id: "user_clerk",
    primaryEmailAddressId: "e1",
    emailAddresses: [{ id: "e1", emailAddress: email }],
    firstName: "Ada",
    lastName: null,
    username: null,
  };
}

beforeEach(() => {
  mockAuth.mockReset();
  getUser.mockReset();
  findUnique.mockReset();
  provisionUser.mockReset();
  redirectMock.mockClear();
});

describe("getCurrentUser", () => {
  test("signed out -> null, without touching the database", async () => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    expect(await getCurrentUser()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("provisioned user is returned straight from the database", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "CANDIDATE" } },
    });
    findUnique.mockResolvedValue({ id: "u1", clerkId: "user_clerk" });

    expect(await getCurrentUser()).toEqual({ id: "u1", clerkId: "user_clerk" });
    // No Clerk round-trip on the common path.
    expect(getUser).not.toHaveBeenCalled();
    expect(provisionUser).not.toHaveBeenCalled();
  });

  // The self-heal this function exists for: accounts onboarded before database
  // provisioning shipped hold a Clerk role but no row, and setRole refuses to run
  // again once a role is set — so without this they would stay broken forever.
  test("role in Clerk but no row -> provisions from the Clerk profile", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "RECRUITER" } },
    });
    findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue(clerkUserWithEmail("ada@example.com"));
    provisionUser.mockResolvedValue({ id: "u1" });

    expect(await getCurrentUser()).toEqual({ id: "u1" });
    expect(provisionUser).toHaveBeenCalledWith({
      clerkId: "user_clerk",
      role: "RECRUITER",
      email: "ada@example.com",
      name: "Ada",
    });
  });

  test("no role yet -> null, and no role is invented", async () => {
    mockAuth.mockResolvedValue({ userId: "user_clerk", sessionClaims: { metadata: {} } });
    findUnique.mockResolvedValue(null);

    expect(await getCurrentUser()).toBeNull();
    expect(provisionUser).not.toHaveBeenCalled();
  });

  test("Clerk account with no email -> null rather than a fabricated row", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "CANDIDATE" } },
    });
    findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ ...clerkUserWithEmail("x@y.z"), emailAddresses: [] });

    expect(await getCurrentUser()).toBeNull();
    expect(provisionUser).not.toHaveBeenCalled();
  });
});

describe("requireCurrentUser", () => {
  test("returns the database user alongside the Clerk session", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "CANDIDATE" } },
    });
    findUnique.mockResolvedValue({ id: "u1" });

    await expect(requireCurrentUser(["CANDIDATE"])).resolves.toEqual({
      clerkUserId: "user_clerk",
      role: "CANDIDATE",
      user: { id: "u1" },
    });
  });

  test("delegates the wrong-role redirect to requireRole", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "RECRUITER" } },
    });

    await expect(requireCurrentUser(["CANDIDATE"])).rejects.toThrow("REDIRECT:/recruiter");
    // Bounced before any database work happened.
    expect(findUnique).not.toHaveBeenCalled();
  });

  test("provisioning failure -> /onboarding rather than a crash", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_clerk",
      sessionClaims: { metadata: { role: "CANDIDATE" } },
    });
    findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({ ...clerkUserWithEmail("x@y.z"), emailAddresses: [] });

    await expect(requireCurrentUser(["CANDIDATE"])).rejects.toThrow("REDIRECT:/onboarding");
  });
});
