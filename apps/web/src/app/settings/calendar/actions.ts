"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  disconnectGoogleCalendar,
  isCalendarSyncConfigured,
  setCalendarSyncEnabled,
} from "@/lib/calendar-accounts";
import { googleAuthUrl, googleOAuthConfig, signOAuthState } from "@/lib/google-oauth";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

const SETTINGS_PATH = "/settings/calendar";

/**
 * Starts the consent flow. A Server Action rather than a plain link so the
 * `state` is signed for whoever is actually signed in at the moment they
 * press the button, not baked into a page that may have been rendered for
 * someone else and left open.
 */
export async function connectCalendar(): Promise<void> {
  const { user } = await requireCurrentUser(ROLES);

  const config = googleOAuthConfig();
  if (!config || !isCalendarSyncConfigured()) {
    redirect(`${SETTINGS_PATH}?calendar=unavailable`);
  }

  // redirect() throws, so it cannot live inside the try that follows.
  const url = googleAuthUrl(config, signOAuthState({ userId: user.id, returnTo: SETTINGS_PATH }));
  redirect(url);
}

export async function disconnectCalendar(): Promise<void> {
  const { user } = await requireCurrentUser(ROLES);
  await disconnectGoogleCalendar(user.id);
  revalidatePath(SETTINGS_PATH);
}

/**
 * Pause or resume without re-consenting. `enabled` comes off a form, so it
 * arrives as a string and is compared as one — `Boolean("false")` is true.
 */
export async function updateCalendarSync(formData: FormData): Promise<void> {
  const { user } = await requireCurrentUser(ROLES);
  await setCalendarSyncEnabled(user.id, formData.get("enabled") === "true");
  revalidatePath(SETTINGS_PATH);
}
