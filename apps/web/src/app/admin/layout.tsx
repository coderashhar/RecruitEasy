import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { ReactNode } from "react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(["ADMIN"]);
  return <AppShell title="Admin">{children}</AppShell>;
}
