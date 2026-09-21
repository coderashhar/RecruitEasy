import { LocalTime } from "@/components/broadsheet/local-time";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { StatusBadge, type Shape, type Tone } from "@/components/broadsheet/status-badge";
import { DeletionRequestActions } from "@/components/privacy/deletion-request-actions";
import { getDeletionRequests } from "@/lib/data-deletion";
import { requireCurrentUser } from "@/lib/users";

/** GDPR gives a month to respond; the chip says how much of it has gone. */
const RESPONSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function deadlineChip(requestedAt: Date, now: Date): { tone: Tone; shape: Shape; day: number } {
  const day = Math.floor((now.getTime() - requestedAt.getTime()) / DAY_MS) + 1;
  if (day >= RESPONSE_DAYS - 5) return { tone: "danger", shape: "bar", day };
  if (day >= 7) return { tone: "warning", shape: "dot", day };
  return { tone: "neutral", shape: "hollow", day };
}

export default async function DeletionRequestsPage() {
  const { user } = await requireCurrentUser(["ADMIN"]);
  const { pending, processed } = await getDeletionRequests(user.orgId);
  const now = new Date();

  return (
    <div className="flex max-w-[880px] flex-col">
      <PageHeader
        title="Data deletion requests"
        description="Candidates asking for their data to be permanently deleted · nothing happens until an admin acts"
      />

      <section aria-labelledby="waiting" className="mt-[26px]">
        <SectionLabel id="waiting" aside={`GDPR · respond within ${RESPONSE_DAYS} days`}>
          Waiting · {pending.length}
          {pending.length > 1 && " · oldest first"}
        </SectionLabel>
        {pending.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No requests waiting.</p>
        ) : (
          pending.map((request) => {
            const chip = deadlineChip(request.requestedAt, now);
            return (
              <div
                key={request.id}
                className="flex flex-col gap-4 border-b border-hairline py-[18px] last:border-b-0 md:flex-row md:items-center md:justify-between md:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-[11px]">
                    <span className="text-base font-semibold tracking-[-0.015em]">
                      {request.user?.name ?? "Account already removed"}
                    </span>
                    <StatusBadge tone={chip.tone} shape={chip.shape}>
                      Day {chip.day} of {RESPONSE_DAYS}
                    </StatusBadge>
                  </div>
                  <div className="mt-[5px] text-[13.5px] text-muted-foreground">
                    {request.user ? (
                      <>
                        {request.user.email} · {request.user._count.applicationsAsCandidate} application
                        {request.user._count.applicationsAsCandidate === 1 ? "" : "s"} · asked{" "}
                        <LocalTime value={request.requestedAt} format="date" />
                      </>
                    ) : (
                      "The user row is gone, so there is nothing left to delete. Close the request to clear the queue."
                    )}
                  </div>
                </div>
                <div className="shrink-0 md:max-w-[420px]">
                  <DeletionRequestActions
                    requestId={request.id}
                    candidateName={request.user?.name ?? null}
                    accountGone={!request.user}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>

      <section aria-labelledby="processed" className="mt-[30px]">
        <SectionLabel id="processed" aside={processed.length > 0 ? "last 50" : undefined}>
          Processed
        </SectionLabel>
        {processed.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing processed yet.</p>
        ) : (
          <>
            <p className="pt-3 text-[13px] text-muted-foreground">
              Completed and closed requests no longer show who asked — that was part of what got deleted.
            </p>
            {processed.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-2 border-b border-hairline py-[13px] text-[13.5px] last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5"
              >
                <span className="flex items-center gap-[11px]">
                  {request.status === "COMPLETED" ? (
                    <StatusBadge tone="success" shape="square">
                      Deleted
                    </StatusBadge>
                  ) : request.status === "CLOSED" ? (
                    // Account already gone: nothing deleted here, nothing refused.
                    <StatusBadge tone="neutral" shape="hollow">
                      Closed · nothing to delete
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="danger" shape="bar">
                      Declined
                    </StatusBadge>
                  )}
                  <span className="font-mono text-[12.5px] text-muted-foreground">{request.id}</span>
                </span>
                <span className="text-muted-foreground sm:text-right">
                  {request.processedBy?.name ?? "A former admin"}
                  {request.processedAt && (
                    <>
                      {" · "}
                      <LocalTime value={request.processedAt} format="date" />
                    </>
                  )}
                  {request.reason && ` · “${request.reason}”`}
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
