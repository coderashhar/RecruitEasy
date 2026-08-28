import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { ReactNode } from "react";

export default async function RecruiterLayout({ children }: { children: ReactNode }) {
  await requireRole(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  return <AppShell title="Recruiter">{children}</AppShell>;
}
