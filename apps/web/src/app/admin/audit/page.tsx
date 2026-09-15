import Link from "next/link";
import { Eyebrow, PageHeader } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { auditTargetHref, getAuditFilterOptions, getAuditLogPage } from "@/lib/audit";
import { describeAuditAction, formatAuditMeta } from "@/lib/audit-format";
import { requireCurrentUser } from "@/lib/users";

type SearchParams = { action?: string; actor?: string; after?: string };

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

const selectClassName =
  "mt-[7px] h-8 w-full border border-input bg-transparent px-[11px] text-[13.5px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function auditHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
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
  const actorName = filters.actors.find((actor) => actor.id === actorId)?.name;
  const filtered = Boolean(action || actorId);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Audit log"
        description="Every recorded change in your organisation, newest first · times in UTC"
      />

      {/* A plain GET form: filters live in the URL, so a filtered view can be shared or reloaded. */}
      <form
        action="/admin/audit"
        className="mt-6 flex flex-wrap items-end gap-3.5 border-t border-b border-t-rule-strong border-b-border py-3.5"
      >
        <label className="w-full sm:w-[248px]">
          <Eyebrow>Action</Eyebrow>
          <select name="action" defaultValue={action ?? ""} className={`${selectClassName} font-mono text-[13px]`}>
            <option value="">All actions</option>
            {filters.actions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="w-full sm:w-[186px]">
          <Eyebrow>Who</Eyebrow>
          <select name="actor" defaultValue={actorId ?? ""} className={selectClassName}>
            <option value="">Anyone</option>
            {filters.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="ink">
          Filter
        </Button>
        {filtered && (
          <Link href="/admin/audit" className="pb-[7px] text-[13.5px] text-primary hover:underline">
            Clear
          </Link>
        )}
        <span className="pb-[7px] font-mono text-[11.5px] text-muted-foreground sm:ml-auto">
          filters live in the URL · this view is shareable
        </span>
      </form>

      {entries.length === 0 ? (
        <div className="mt-5">
          <div className="text-base font-semibold tracking-[-0.015em]">
            {filtered ? "No entries match" : "Nothing recorded yet"}
          </div>
          <p className="mt-2 max-w-[480px] text-sm leading-relaxed text-muted-foreground">
            {filtered
              ? `${actorName ?? "Nobody"}${action ? ` has no ${action} entries` : " has no entries"}${after ? " older than this page" : ""}. Drop a filter to widen the search.`
              : "Changes to applications, interviews, jobs and privacy requests are recorded here as they happen."}
          </p>
          {action && actorId && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="outline" nativeButton={false} render={<Link href={auditHref({ action })}>Anyone, this action</Link>} />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={auditHref({ actor: actorId })}>{actorName ?? "This person"}, all actions</Link>}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule-strong">
                  <th className="w-[158px] pb-[9px] text-left font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    When
                  </th>
                  <th className="w-[142px] pb-[9px] text-left font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    Who
                  </th>
                  <th className="pb-[9px] text-left font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    What happened
                  </th>
                  <th className="w-[210px] pb-[9px] text-left font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const href = auditTargetHref(entry.action, entry.target);
                  const iso = entry.createdAt.toISOString();
                  const sentence = describeAuditAction(entry.action, entry.meta);
                  const meta = formatAuditMeta(entry.meta);
                  return (
                    <tr key={entry.id} className="border-b border-hairline align-top last:border-b-0">
                      <td className="py-3.5">
                        <div className="font-mono text-[12.5px] tabular-nums">{iso.slice(0, 10)}</div>
                        <div className="mt-0.5 font-mono text-[12.5px] text-muted-foreground tabular-nums">
                          {iso.slice(11, 19)}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        {/* A null actor is the system; a deleted account's rows also lose their actor (SetNull). */}
                        {entry.actor ? (
                          <span className="font-medium">{entry.actor.name}</span>
                        ) : (
                          <span className="text-muted-foreground">System or removed account</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-6">
                        <div>
                          {sentence.parts.map((part, index) =>
                            part.strong ? (
                              <span key={index} className="font-semibold">
                                {part.text}
                              </span>
                            ) : (
                              <span key={index}>{part.text}</span>
                            ),
                          )}
                        </div>
                        <div className="mt-[5px] truncate font-mono text-[11.5px] text-muted-foreground" title={meta}>
                          {entry.action}
                          {meta && ` · ${meta}`}
                        </div>
                      </td>
                      <td className="py-3.5">
                        {!entry.target ? (
                          <span className="font-mono text-[12.5px] text-muted-foreground">—</span>
                        ) : href ? (
                          <Link href={href} className="block truncate font-mono text-[12.5px] text-primary hover:underline">
                            {entry.target}
                          </Link>
                        ) : (
                          <>
                            <span className="block truncate font-mono text-[12.5px]">{entry.target}</span>
                            <span className="mt-[3px] block text-[12.5px] text-muted-foreground">no page for this record</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-rule-strong pt-[18px] text-[13.5px]">
            {after ? (
              <Link href={auditHref({ action, actor: actorId })} className="text-primary hover:underline">
                ← Newest
              </Link>
            ) : (
              <span />
            )}
            <span className="hidden font-mono text-[11.5px] text-muted-foreground md:inline">
              50 per page · entries never shift as new ones arrive
            </span>
            {nextAfter ? (
              <Link href={auditHref({ action, actor: actorId, after: nextAfter })} className="text-primary hover:underline">
                Older →
              </Link>
            ) : (
              <span className="text-muted-foreground">End of log</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
