import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeletionRequestActions } from "@/components/privacy/deletion-request-actions";
import { getDeletionRequests } from "@/lib/data-deletion";
import { requireCurrentUser } from "@/lib/users";

export default async function DeletionRequestsPage() {
  const { user } = await requireCurrentUser(["ADMIN"]);
  const { pending, processed } = await getDeletionRequests(user.orgId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Data deletion requests</h1>
          <p className="text-sm text-muted-foreground">Candidates asking for their data to be permanently deleted.</p>
        </div>
        <Link href="/admin/audit" className="text-sm text-primary hover:underline">
          Audit log
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Waiting</CardTitle>
          <CardDescription>{pending.length === 0 ? "No requests waiting." : "Oldest first."}</CardDescription>
        </CardHeader>
        {pending.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {pending.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{request.user?.name ?? "Account already removed"}</div>
                  <div className="text-muted-foreground">
                    {request.user?.email} · {request.user?._count.applicationsAsCandidate ?? 0} application(s) · asked{" "}
                    {request.requestedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </div>
                </div>
                <DeletionRequestActions requestId={request.id} candidateName={request.user?.name ?? "this candidate"} />
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Processed</CardTitle>
          <CardDescription>
            {processed.length === 0
              ? "Nothing processed yet."
              : "Completed requests no longer show who asked: that was part of what got deleted."}
          </CardDescription>
        </CardHeader>
        {processed.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {processed.map((request) => (
              <div key={request.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Badge variant={request.status === "COMPLETED" ? "secondary" : "outline"}>
                    {request.status === "COMPLETED" ? "Deleted" : "Declined"}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{request.id}</span>
                </span>
                <span className="text-muted-foreground">
                  {request.processedBy?.name ?? "A former admin"} ·{" "}
                  {request.processedAt?.toLocaleDateString(undefined, { dateStyle: "medium" })}
                  {request.reason && ` · “${request.reason}”`}
                </span>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
