import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentUser } from "@/lib/users";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, role } = await requireCurrentUser(["ADMIN"]);
  return (
    <AppShell role={role} user={user}>
      {children}
    </AppShell>
  );
}
