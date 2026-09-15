import Link from "next/link";
import { LocalTime } from "@/components/broadsheet/local-time";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { relativeTime } from "@/components/broadsheet/relative-time";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { getFeedbackDue, getInterviewerSchedule } from "@/lib/queries";

/** Feedback is expected within a day of the interview ending. */
const FEEDBACK_DUE_MS = 24 * 60 * 60 * 1000;
/** Joinable from this long before the slot, so nobody waits on a locked door. */
const JOINABLE_MS = 15 * 60 * 1000;

function daysOverdue(endedAt: Date, now: Date) {
  return Math.max(1, Math.floor((now.getTime() - endedAt.getTime() - FEEDBACK_DUE_MS) / FEEDBACK_DUE_MS) + 1);
}

/**
 * An interviewer's first screen: the day's interviews, the prep for the next
 * one, and the feedback they owe — which a dashboard link used to hide.
 */
export async function InterviewerToday({ user }: { user: { id: string; orgId: string } }) {
  const [schedule, feedbackDue] = await Promise.all([getInterviewerSchedule(user), getFeedbackDue(user)]);
  const now = new Date();

  const overdue = feedbackDue.filter(
    (interview) => now.getTime() - (interview.scheduledAt.getTime() + interview.durationMins * 60_000) > FEEDBACK_DUE_MS,
  );
  const next = schedule[0];

  const summary = [
    schedule.length === 0
      ? "No interviews coming up"
      : `${schedule.length} interview${schedule.length === 1 ? "" : "s"} coming up`,
    feedbackDue.length > 0 && `${feedbackDue.length} feedback form${feedbackDue.length === 1 ? "" : "s"} to write`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col">
      <PageHeader title="Today" description={summary} />

      {overdue.length > 0 && (
        <CalloutBanner
          className="mt-6"
          tone="warning"
          title={`${overdue.length} feedback form${overdue.length === 1 ? " is" : "s are"} overdue.`}
          action={
            <Button
              size="sm"
              variant="ink"
              nativeButton={false}
              render={<Link href="/recruiter/feedback">Write {overdue.length === 1 ? "it" : overdue.length === 2 ? "both" : "them"}</Link>}
            />
          }
        >
          {overdue
            .map((interview) => {
              const ended = new Date(interview.scheduledAt.getTime() + interview.durationMins * 60_000);
              const days = daysOverdue(ended, now);
              return `${interview.application.candidate.name} (${days} day${days === 1 ? "" : "s"})`;
            })
            .join(" and ")}
          . The panel cannot decide until {overdue.length === 1 ? "it lands" : "they land"}.
        </CalloutBanner>
      )}

      <div className="mt-[26px] grid items-start gap-11 lg:grid-cols-2">
        <section aria-labelledby="schedule">
          <SectionLabel id="schedule">Schedule</SectionLabel>
          {schedule.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nothing scheduled. New invites land here.</p>
          ) : (
            schedule.map((interview) => {
              const joinable =
                interview.status === "IN_PROGRESS" || interview.scheduledAt.getTime() - now.getTime() <= JOINABLE_MS;
              return (
                <div
                  key={interview.id}
                  className="flex items-center gap-[18px] border-b border-hairline py-[15px] last:border-b-0"
                >
                  <LocalTime
                    value={interview.scheduledAt}
                    format="time"
                    className="w-[46px] shrink-0 font-mono text-[13px] tabular-nums"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/recruiter/interviews/${interview.id}`}
                      className="text-[14.5px] font-semibold hover:underline"
                    >
                      {interview.application.candidate.name}
                    </Link>
                    <div className="mt-0.5 text-[13px] text-muted-foreground">
                      {interview.application.job.title} · round {interview.round} ·{" "}
                      <LocalTime value={interview.scheduledAt} format="dayMonth" />
                    </div>
                  </div>
                  {joinable ? (
                    <Button size="sm" nativeButton={false} render={<Link href={`/interview/${interview.id}`}>Join</Link>} />
                  ) : (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {relativeTime(interview.scheduledAt, now)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </section>

        {next && (
          <section aria-labelledby="prep">
            <SectionLabel id="prep">Prep · {next.application.candidate.name}</SectionLabel>
            <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
              {next.application.job.title}, round {next.round}. Read earlier rounds&apos; feedback and the résumé
              breakdown before you join.
            </p>
            <div className="mt-4 flex flex-col">
              <div className="flex items-center justify-between border-b border-hairline py-[11px] text-[13.5px]">
                <span>Profile, résumé and earlier feedback</span>
                <Link href={`/recruiter/candidates/${next.applicationId}`} className="text-primary hover:underline">
                  Open
                </Link>
              </div>
              <div className="flex items-center justify-between py-[11px] text-[13.5px]">
                <span>Interview details and panel</span>
                <Link href={`/recruiter/interviews/${next.id}`} className="text-primary hover:underline">
                  Open
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
