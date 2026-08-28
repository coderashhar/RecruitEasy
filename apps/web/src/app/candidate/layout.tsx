import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { ReactNode } from "react";

export default async function CandidateLayout({ children }: { children: ReactNode }) {
  await requireRole(["CANDIDATE"]);
  return <AppShell title="Candidate">{children}</AppShell>;
}
