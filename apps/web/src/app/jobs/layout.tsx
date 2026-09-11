import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { ReactNode } from "react";

export default async function JobsLayout({ children }: { children: ReactNode }) {
  await requireRole(["CANDIDATE"]);
  return <AppShell title="Jobs">{children}</AppShell>;
}
