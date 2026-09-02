import { describe, test, expect, vi, beforeEach } from "vitest";

// requireRole is a Server Component / layout guard, so it can't be exercised
// through a running Next.js app without a live Clerk instance. Mocking
// Clerk's auth() and Next's redirect() lets the branch logic itself — the
// thing that actually decides who sees which dashboard — be verified
// without one.
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => mockAuth() }));

// next/navigation's redirect() throws in real Next.js (it's caught by the
// framework to short-circuit rendering) rather than returning. Mirroring
// that here means requireRole's own `if (...) redirect(...)` early-return
// pattern behaves the same way under test as it does in production — a test
// that let execution fall through past a redirect() call would be testing
// something Next.js never actually allows to happen.
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirectMock(path) }));

const { requireRole } = await import("./auth.js");

function redirectedTo(fn: () => Promise<unknown>): Promise<string> {
  return fn()
    .then(() => {
      throw new Error("expected a redirect, but requireRole returned normally");
    })
    .catch((err: Error) => {
      const match = err.message.match(/^REDIRECT:(.+)$/);
      if (!match) throw err;
      return match[1];
    });
}

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    redirectMock.mockClear();
  });

  test("signed out -> /sign-in", async () => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    await expect(redirectedTo(() => requireRole(["CANDIDATE"]))).resolves.toBe("/sign-in");
  });

  test("signed in, no role assigned yet -> /onboarding", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", sessionClaims: { metadata: {} } });
    await expect(redirectedTo(() => requireRole(["CANDIDATE"]))).resolves.toBe("/onboarding");
  });

  // The finding this guards against: an already-onboarded RECRUITER hitting
  // /candidate used to land back on the role-picker screen instead of their
  // own dashboard — confusing, and inconsistent with what middleware.ts does
  // for the same situation.
  test("signed in, wrong role for this route -> that role's own dashboard, not /onboarding", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", sessionClaims: { metadata: { role: "RECRUITER" } } });
    await expect(redirectedTo(() => requireRole(["CANDIDATE"]))).resolves.toBe("/recruiter");
  });

  test("signed in, matching role -> allowed through, no redirect", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", sessionClaims: { metadata: { role: "CANDIDATE" } } });
    const result = await requireRole(["CANDIDATE"]);
    expect(result).toEqual({ userId: "u1", role: "CANDIDATE" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("multiple allowed roles: any of them passes", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", sessionClaims: { metadata: { role: "ADMIN" } } });
    const result = await requireRole(["RECRUITER", "INTERVIEWER", "ADMIN"]);
    expect(result.role).toBe("ADMIN");
  });

  test("garbage in sessionClaims.metadata.role is treated as no role", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", sessionClaims: { metadata: { role: "not-a-real-role" } } });
    await expect(redirectedTo(() => requireRole(["CANDIDATE"]))).resolves.toBe("/onboarding");
  });
});
