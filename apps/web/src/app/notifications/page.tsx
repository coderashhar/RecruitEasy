import { prisma } from "@interviewhub/db";
import { LocalTime } from "@/components/broadsheet/local-time";
import { EmptyNote, PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";
import { cn } from "@/lib/utils";
import { MarkAllReadButton } from "./mark-all-read-button";

export const metadata = { title: "Notifications" };

/** The bell only lists unread ones; this is where the rest can still be found. */
export default async function NotificationsPage() {
  const { user } = await requireCurrentUser(ROLES);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="flex max-w-[880px] flex-col">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={unreadCount > 0 ? <MarkAllReadButton /> : undefined}
      />

      <section aria-labelledby="recent" className="mt-[30px]">
        <SectionLabel id="recent" aside={notifications.length === 50 ? "latest 50" : undefined}>
          Recent
        </SectionLabel>
        {notifications.length === 0 ? (
          <EmptyNote>No notifications yet.</EmptyNote>
        ) : (
          <ul>
            {notifications.map((notification) => {
              const body = (
                <>
                  <span className="text-[14px] font-medium">{notification.title}</span>
                  <span className="text-[13px] text-muted-foreground">{notification.body}</span>
                  {/* Rendered in the viewer's own timezone: formatting on the
                      server would print UTC on Vercel. */}
                  <LocalTime
                    value={notification.createdAt}
                    className="font-mono text-[11.5px] text-muted-foreground"
                  />
                </>
              );
              const className = cn(
                "flex flex-col gap-1 border-b border-hairline py-3.5 last:border-b-0",
                notification.readAt ? "opacity-60" : "border-l-2 border-l-primary pl-3",
              );
              return (
                <li key={notification.id}>
                  {/* A cancellation has nowhere to go; it reads, it doesn't link. */}
                  {notification.link ? (
                    <a href={notification.link} className={cn(className, "hover:bg-muted/50")}>
                      {body}
                    </a>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
