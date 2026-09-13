import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auditTargetHref, getAuditFilterOptions, getAuditLogPage } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/users";

type SearchParams = { action?: string; actor?: string; after?: string };

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

function formatMeta(meta: unknown): string {
  if (meta === null || meta === undefined) return "";
  const text = JSON.stringify(meta);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<keyof SearchParams, string | string[] | undefined>>;
}) {
  const { user } = await requireCurrentUser(["ADMIN"]);
  const params = await searchParams;
  const action = first(params.action);
  const actorId = first(params.actor);
  const after = first(params.after);

  const [{ entries, nextAfter }, filters] = await Promise.all([
    getAuditLogPage(user.orgId, { action, actorId, after }),
    getAuditFilterOptions(user.orgId),
  ]);

  const filterQuery = new URLSearchParams({
    ...(action && { action }),
    ...(actorId && { actor: actorId }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Audit log</h1>
          <p className="text-sm text-muted-foreground">Every recorded change in your organisation, newest first.</p>
        </div>
        <Link href="/admin/deletion-requests" className="text-sm text-primary hover:underline">
          Data deletion requests
        </Link>
      </div>

      <Card>
        <CardHeader>
          {/* A plain GET form: filters live in the URL, so a filtered view can be shared or reloaded. */}
          <form className="flex flex-wrap items-end gap-3" action="/admin/audit">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Action
              <select
                name="action"
                defaultValue={action ?? ""}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              >
                <option value="">All actions</option>
                {filters.actions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Who
              <select
                name="actor"
                defaultValue={actorId ?? ""}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              >
                <option value="">Anyone</option>
                {filters.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              Filter
            </Button>
            {(action || actorId) && (
              <Link href="/admin/audit" className="pb-1.5 text-sm text-primary hover:underline">
                Clear
              </Link>
            )}
          </form>
          <CardTitle className="sr-only">Entries</CardTitle>
          <CardDescription>
            {entries.length === 0 ? "No entries match." : after ? "Older entries." : undefined}
          </CardDescription>
        </CardHeader>
        {entries.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">When (UTC)</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const href = auditTargetHref(entry.action, entry.target);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                          {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {entry.actor?.name ?? <span className="text-muted-foreground">System</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {href ? (
                            <Link href={href} className="text-primary hover:underline">
                              {entry.target}
                            </Link>
                          ) : (
                            (entry.target ?? "—")
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(entry.meta ?? null)}>
                          {formatMeta(entry.meta)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between text-sm">
              {after ? (
                <Link href={`/admin/audit?${filterQuery}`} className="text-primary hover:underline">
                  Newest
                </Link>
              ) : (
                <span />
              )}
              {nextAfter && (
                <Link
                  href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(filterQuery), after: nextAfter })}`}
                  className="text-primary hover:underline"
                >
                  Older
                </Link>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
