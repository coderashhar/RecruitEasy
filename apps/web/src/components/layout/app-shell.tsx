import { UserButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { navigationFor, ROLE_LABEL } from "@/lib/navigation";
import { getNavCounts, getOrganizationName } from "@/lib/queries";
import type { Role } from "@/lib/roles";
import { AppSidebar, MobileNav, type ShellIdentity } from "./app-nav";
import { NotificationBell } from "./notification-bell";

/**
 * Same shell for every role; the sidebar is what changes. Counts are read
 * when the layout renders — a Server Action that changes one revalidates the
 * path, which refreshes them.
 */
export async function AppShell({
  role,
  user,
  children,
}: {
  role: Role;
  user: { id: string; orgId: string; name: string };
  children: ReactNode;
}) {
  const [counts, orgName] = await Promise.all([
    getNavCounts(user, role),
    role === "CANDIDATE" ? Promise.resolve(null) : getOrganizationName(user.orgId),
  ]);
  const sections = navigationFor(role, counts);
  const identity: ShellIdentity = {
    name: user.name,
    detail: orgName ? `${ROLE_LABEL[role]} · ${orgName}` : ROLE_LABEL[role],
  };

  return (
    <div className="flex min-h-dvh">
      <AppSidebar sections={sections} identity={identity} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-[54px] shrink-0 items-center justify-between gap-4 border-b bg-background px-[18px] lg:static lg:h-[68px] lg:justify-end lg:border-b-0 lg:px-10">
          <MobileNav sections={sections} identity={identity} />
          <div className="flex items-center gap-3.5 lg:gap-5">
            <NotificationBell />
            <UserButton />
          </div>
        </header>
        <main className="flex-1 px-[18px] pt-5 pb-10 lg:px-10 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
