import { UserButton } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-semibold tracking-tight">InterviewHub AI</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{title}</span>
          <UserButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
