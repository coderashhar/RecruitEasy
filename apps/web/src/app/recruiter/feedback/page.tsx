import Link from "next/link";
import { LocalTime } from "@/components/broadsheet/local-time";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { StatusBadge } from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { getFeedbackDue } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function FeedbackDuePage() {
  // Anyone who sat in as an interviewer owes feedback, whatever their platform role.
  const { user } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const due = await getFeedbackDue(user);
  const now = new Date().getTime();

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Feedback due"
        description={
          due.length === 0
            ? "You are clear. Nothing waiting on you."
            : `${due.length} completed interview${due.length === 1 ? "" : "s"} waiting on your feedback · due within 24 hours of ending`
        }
      />
      <section aria-labelledby="due" className="mt-[30px]">
        <SectionLabel id="due" aside={due.length > 0 ? "oldest first" : undefined}>
          Waiting on you
        </SectionLabel>
        {due.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Feedback you owe appears here once an interview is marked completed — by you from its page, or by a recruiter.</p>
        ) : (
          <ul>
            {due.map((interview) => {
              const ended = interview.scheduledAt.getTime() + interview.durationMins * 60_000;
              const overdueDays = Math.floor((now - ended - DAY_MS) / DAY_MS) + 1;
              const hoursLeft = Math.max(0, Math.ceil((ended + DAY_MS - now) / (60 * 60 * 1000)));
              return (
                <li
                  key={interview.id}
                  className="flex flex-col gap-3 border-b border-hairline py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold">{interview.application.candidate.name}</div>
                    <div className="mt-[3px] text-[13px] text-muted-foreground">
                      {interview.application.job.title} · round {interview.round} ·{" "}
                      <LocalTime value={interview.scheduledAt} format="date" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {overdueDays > 0 ? (
                      <StatusBadge tone="warning" shape="dot">
                        {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral" shape="hollow">
                        Due in {hoursLeft} h
                      </StatusBadge>
                    )}
                    <Button
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/recruiter/interviews/${interview.id}#feedback`}>Write feedback</Link>}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
