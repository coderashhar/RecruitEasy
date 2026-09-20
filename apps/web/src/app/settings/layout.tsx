import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

/**
 * Settings belong to the person, not to a role: a candidate, an interviewer
 * and a recruiter all have the same calendar to connect. Hence one section
 * open to every role, rather than a copy under /candidate and /recruiter.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { user, role } = await requireCurrentUser(ROLES);
  return (
    <AppShell role={role} user={user}>
      {children}
    </AppShell>
  );
}
