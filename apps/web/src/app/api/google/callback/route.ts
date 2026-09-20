import { NextResponse, type NextRequest } from "next/server";
import { connectGoogleCalendar } from "@/lib/calendar-accounts";
import { verifyOAuthState } from "@/lib/google-oauth";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

/**
 * Where Google sends the browser back after the consent screen.
 *
 * Two independent checks, both required: the signed `state` proves this app
 * started the flow (without it, a link could walk a signed-in user into
 * binding somebody else's calendar to their account), and the Clerk session
 * proves who is here now. They must name the same person — a consent screen
 * completed in one account's browser must not attach to another's, which is
 * what a shared or hijacked callback URL would otherwise achieve.
 *
 * Outcomes come back as a query string on the settings page rather than as a
 * response body: this is a redirect target for a browser, not an API.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const settings = new URL("/settings/calendar", request.url);

  const fail = (reason: string) => {
    settings.searchParams.set("calendar", reason);
    return NextResponse.redirect(settings);
  };

  // The user pressed "Cancel" on Google's consent screen. Not an error.
  if (params.get("error")) return fail("cancelled");

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code) return fail("failed");

  const verified = verifyOAuthState(state);
  if (!verified) return fail("expired");

  const { user } = await requireCurrentUser(ROLES);
  if (user.id !== verified.userId) return fail("failed");

  try {
    await connectGoogleCalendar(user.id, code);
  } catch (err) {
    // The detail (which Google endpoint, which status) is for the operator;
    // the person sees one sentence, the same split lib/error-copy.ts makes.
    console.error(`[google-callback] couldn't connect a calendar for user ${user.id}`, err);
    return fail("failed");
  }

  const done = new URL(verified.returnTo, request.url);
  done.searchParams.set("calendar", "connected");
  return NextResponse.redirect(done);
}
