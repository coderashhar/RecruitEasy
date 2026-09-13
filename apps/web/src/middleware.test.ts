import { describe, test, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// clerkMiddleware(callback) normally wraps `callback` with Clerk's own
// request handling; mocking it down to identity exposes that inner callback
// (middleware.ts's default export) as a plain, directly-callable function —
// the actual redirect-branching logic under test — without needing a live
// Clerk instance or a running Next.js server.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: (patterns: string[]) => {
    // Faithful enough for the exact patterns middleware.ts uses (a literal
    // path, or a path with a "(.*)" wildcard suffix) — this is testing our
    // own redirect branches, not re-verifying Clerk's path-matcher library.
    const regexes = patterns.map((p) => {
      const [prefix] = p.split("(.*)");
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return p.includes("(.*)") ? new RegExp(`^${escaped}.*$`) : new RegExp(`^${escaped}$`);
    });
    return (req: { nextUrl: { pathname: string } }) =>
      regexes.some((re) => re.test(req.nextUrl.pathname));
  },
}));

// The real default export is typed as Clerk's NextMiddleware (a (req) =>
// ... signature); mocking clerkMiddleware to identity changes what's
// actually there at runtime to the (auth, req) callback middleware.ts
// passes in. `unknown` first because the declared and actual shapes don't
// overlap enough for TS to allow a direct cast.
const middleware = (await import("./middleware.js")).default as unknown as (
  auth: () => Promise<{ userId: string | null; sessionClaims: unknown; redirectToSignIn: (opts: unknown) => unknown }>,
  req: NextRequest,
) => Promise<Response | undefined>;

function reqFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

function fakeAuth(userId: string | null, role?: string) {
  return () =>
    Promise.resolve({
      userId,
      sessionClaims: role ? { metadata: { role } } : null,
      redirectToSignIn: vi.fn(() => new Response(null, { status: 307, headers: { location: "/sign-in" } })),
    });
}

function locationOf(res: Response | undefined): string | null {
  return res instanceof Response ? res.headers.get("location") : null;
}

describe("middleware", () => {
  test("public routes pass through unauthenticated", async () => {
    for (const path of ["/", "/sign-in", "/sign-up/verify", "/api/cron/reminders"]) {
      const res = await middleware(fakeAuth(null), reqFor(path));
      expect(res).toBeUndefined();
    }
  });

  test("protected route, signed out -> redirectToSignIn is invoked", async () => {
    const redirectToSignIn = vi.fn(() => new Response(null, { status: 307 }));
    const auth = () => Promise.resolve({ userId: null, sessionClaims: null, redirectToSignIn });
    await middleware(auth, reqFor("/candidate"));
    expect(redirectToSignIn).toHaveBeenCalledOnce();
  });

  test("signed in, no role -> /onboarding (unless already there)", async () => {
    const res = await middleware(fakeAuth("u1"), reqFor("/candidate"));
    expect(locationOf(res)).toBe("http://localhost:3000/onboarding");
  });

  test("signed in, no role, already on /onboarding -> no redirect (avoids a loop)", async () => {
    const res = await middleware(fakeAuth("u1"), reqFor("/onboarding"));
    expect(res).toBeUndefined();
  });

  test("CANDIDATE hitting /recruiter -> bounced to /candidate", async () => {
    const res = await middleware(fakeAuth("u1", "CANDIDATE"), reqFor("/recruiter"));
    expect(locationOf(res)).toBe("http://localhost:3000/candidate");
  });

  test("RECRUITER hitting /candidate -> bounced to /recruiter", async () => {
    const res = await middleware(fakeAuth("u1", "RECRUITER"), reqFor("/candidate"));
    expect(locationOf(res)).toBe("http://localhost:3000/recruiter");
  });

  test.each(["INTERVIEWER", "RECRUITER", "ADMIN"])("%s may access /recruiter", async (role) => {
    const res = await middleware(fakeAuth("u1", role), reqFor("/recruiter"));
    expect(res).toBeUndefined();
  });

  test("CANDIDATE may access /candidate", async () => {
    const res = await middleware(fakeAuth("u1", "CANDIDATE"), reqFor("/candidate"));
    expect(res).toBeUndefined();
  });
});
