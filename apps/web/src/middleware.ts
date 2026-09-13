import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DASHBOARD_PATH, isRole } from "@/lib/roles";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Called by a scheduler, which has no Clerk session. Each route checks
  // CRON_SECRET itself (lib/cron-auth.ts) and refuses everything without it.
  "/api/cron(.*)",
]);

const isRecruiterRoute = createRouteMatcher(["/recruiter(.*)"]);
const isCandidateRoute = createRouteMatcher(["/candidate(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  const role = sessionClaims?.metadata?.role;

  // A signed-in user with no role yet (metadata not set) has nowhere
  // protected to go until onboarding assigns one.
  if (!isRole(role)) {
    if (req.nextUrl.pathname !== "/onboarding") {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
    return;
  }

  if (isRecruiterRoute(req) && !(role === "RECRUITER" || role === "INTERVIEWER" || role === "ADMIN")) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH[role], req.url));
  }

  if (isCandidateRoute(req) && role !== "CANDIDATE") {
    return NextResponse.redirect(new URL(DASHBOARD_PATH[role], req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
