import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@interviewhub/db";
import { requireCurrentUser } from "@/lib/users";
import { MarkAllReadButton } from "./mark-all-read-button";

export default async function NotificationsPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </CardDescription>
          </div>
          {unreadCount > 0 && <MarkAllReadButton />}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((notification) => (
              <a
                key={notification.id}
                href={notification.link ?? "#"}
                className={`flex flex-col gap-0.5 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50 ${
                  notification.readAt ? "opacity-60" : "border-l-2 border-l-primary"
                }`}
              >
                <span className="font-medium">{notification.title}</span>
                <span className="text-muted-foreground">{notification.body}</span>
                <span className="text-xs text-muted-foreground">
                  {notification.createdAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </a>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
