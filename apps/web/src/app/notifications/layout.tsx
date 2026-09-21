import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

/**
 * Every role gets notifications — invites, reminders, deletion requests — so
 * the full list lives outside any one role's section, like /settings.
 */
export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const { user, role } = await requireCurrentUser(ROLES);
  return (
    <AppShell role={role} user={user}>
      {children}
    </AppShell>
  );
}
