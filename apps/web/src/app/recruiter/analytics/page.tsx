import Link from "next/link";
import { BarList, WeeklyColumns } from "@/components/analytics/charts";
import { StatMeasure, StatRow } from "@/components/broadsheet/measures";
import { SectionLabel, PageHeader } from "@/components/broadsheet/section";
import { APPLICATION_STATUS, StatusBadge, StatusGlyph } from "@/components/broadsheet/status-badge";
import { ANALYTICS_RANGES, getOrgAnalytics, parseRange } from "@/lib/analytics";
import { requireCurrentUser } from "@/lib/users";
import { cn } from "@/lib/utils";

const rangeLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const rangeLabelYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  // Org-wide hiring numbers are a recruiting concern, not an interviewer's.
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const range = parseRange((await searchParams).range);
  const analytics = await getOrgAnalytics(user.orgId, range);
  const { interviews } = analytics;

  const rate = interviews.completionRate;
  const applicationsTotal = analytics.applicationsPerWeek.reduce((sum, week) => sum + week.count, 0);
  const applicationsPeak = Math.max(0, ...analytics.applicationsPerWeek.map((week) => week.count));
  const hiresPeak = Math.max(0, ...analytics.hiresPerWeek.map((week) => week.count));
  const allTime = analytics.funnel.reduce((sum, step) => sum + step.count, 0);
  const jobsWithApplications = analytics.atsByJob.filter((job) => job.applications > 0).length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Hiring analytics"
        description={`${rangeLabel.format(analytics.from)} – ${rangeLabelYear.format(analytics.to)} · pipeline and ATS figures are as of now`}
        actions={
          <nav aria-label="Date range" className="flex border border-input">
            {ANALYTICS_RANGES.map((option) => (
              <Link
                key={option}
                href={`/recruiter/analytics?range=${option}`}
                aria-current={option === range ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center px-3.5 text-[13.5px]",
                  option === range
                    ? "bg-foreground font-semibold text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option} days
              </Link>
            ))}
          </nav>
        }
      />

      <StatRow className="mt-7">
        <StatMeasure
          label="Interview completion"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          muted={rate === null}
          detail={
            rate === null ? (
              "Nothing marked completed, no-show or cancelled yet"
            ) : (
              <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <StatusGlyph shape="square" tone="success" />
                  {interviews.counts.COMPLETED ?? 0} completed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusGlyph shape="dot" tone="warning" />
                  {interviews.counts.NO_SHOW ?? 0} no-show
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StatusGlyph shape="bar" tone="danger" />
                  {interviews.counts.CANCELLED ?? 0} cancelled
                </span>
              </span>
            )
          }
          caveat={
            interviews.unrecorded > 0 ? (
              <>
                {plural(interviews.unrecorded, "interview")} {interviews.unrecorded === 1 ? "is" : "are"} past{" "}
                {interviews.unrecorded === 1 ? "its" : "their"} slot but still scheduled or in progress, so{" "}
                {interviews.unrecorded === 1 ? "it is" : "they are"} excluded.{" "}
                <Link href="/recruiter/interviews" className="text-primary hover:underline">
                  Resolve {interviews.unrecorded === 1 ? "it" : "them"}
                </Link>
              </>
            ) : rate === null ? (
              "An em dash, never 0%: a rate would be a claim the data cannot make."
            ) : undefined
          }
        />
        <StatMeasure
          label="Hires"
          value={analytics.hires}
          detail={`Moved to Hired in the last ${range} days`}
          caveat="Counted from the audit trail, so it is when the move happened — not where applications sit now."
        />
        <StatMeasure
          label="Active applications"
          value={analytics.activeApplications}
          detail={`Not yet hired or rejected · across ${plural(jobsWithApplications, "job")}`}
          caveat={`Current state, not range-limited. Unaffected by the ${ANALYTICS_RANGES.join("/")} switch.`}
        />
      </StatRow>

      <div className="mt-8 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="applications-weekly">
          <SectionLabel id="applications-weekly" aside={`${applicationsTotal} total · peak ${applicationsPeak} · UTC`}>
            New applications per week
          </SectionLabel>
          <WeeklyColumns weeks={analytics.applicationsPerWeek} label="New applications per week" unit="applications" />
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            Every week in range is drawn, including empty ones, so a quiet week reads as quiet rather than disappearing.
          </p>
        </section>
        <section aria-labelledby="hires-weekly">
          <SectionLabel id="hires-weekly" aside={`${analytics.hires} total · peak ${hiresPeak} · UTC`}>
            Hires per week
          </SectionLabel>
          <WeeklyColumns weeks={analytics.hiresPerWeek} label="Hires per week" unit="hires" />
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            A zero week keeps its baseline rule and its label, so the gap is legible as a real zero.
          </p>
        </section>
      </div>

      <div className="mt-8 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="by-status">
          <SectionLabel id="by-status" aside={`all time · ${allTime}`}>
            Applications by current status
          </SectionLabel>
          <BarList
            label="Applications by status"
            items={analytics.funnel.map((step) => {
              const display = APPLICATION_STATUS[step.status];
              return {
                key: step.status,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <StatusGlyph shape={display.shape} tone={display.tone} />
                    {display.label}
                  </span>
                ),
                value: step.count,
              };
            })}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            Not a funnel: Rejected is a terminal state, not a later stage, so these don&apos;t describe a conversion.
          </p>
        </section>
        <section aria-labelledby="ats-by-job">
          <SectionLabel id="ats-by-job" aside="out of 100 · latest score each">
            Average ATS score by job
          </SectionLabel>
          {analytics.atsByJob.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No jobs posted yet.{" "}
              <Link href="/recruiter/jobs/new" className="text-primary hover:underline">
                Post the first job
              </Link>
            </p>
          ) : (
            <>
              <BarList
                label="Average ATS score by job"
                max={100}
                labelWidth={150}
                items={analytics.atsByJob.map((job) => ({
                  key: job.jobId,
                  label: job.title,
                  value: job.averageScore,
                  note: `${job.scored}/${job.applications}`,
                }))}
              />
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                The scored-of-total count sits beside every average, because an 81 from 11 résumés and an 81 from 2 are
                not the same claim.
              </p>
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="interviewers" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="interviewers" className="font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
            Interviewers · last {range} days
          </h2>
          <span className="text-[13px] text-muted-foreground">Feedback is counted against completed interviews only</span>
        </div>
        {analytics.interviewers.length === 0 ? (
          <p className="mt-3 border-t border-rule-strong py-4 text-sm text-muted-foreground">No interviews in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-t border-b border-t-rule-strong border-b-border">
                  {["Interviewer", "Scheduled", "Completed", "Feedback given", "Outstanding"].map((heading, index) => (
                    <th
                      key={heading}
                      className={`py-2.5 font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase ${index === 0 ? "text-left" : "text-right"}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.interviewers.map((interviewer) => {
                  const outstanding = interviewer.completed - interviewer.feedbackGiven;
                  return (
                    <tr key={interviewer.name} className="border-b border-hairline last:border-b-0">
                      <td className="py-[13px] font-medium">{interviewer.name}</td>
                      <td className="py-[13px] text-right font-mono tabular-nums">{interviewer.scheduled}</td>
                      <td className="py-[13px] text-right font-mono tabular-nums">{interviewer.completed}</td>
                      <td className="py-[13px] text-right font-mono tabular-nums">
                        {interviewer.completed === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${interviewer.feedbackGiven} of ${interviewer.completed}`
                        )}
                      </td>
                      <td className="py-[13px] text-right">
                        {interviewer.completed === 0 ? (
                          <span className="text-[13px] text-muted-foreground">Nothing completed</span>
                        ) : outstanding > 0 ? (
                          <StatusBadge tone="warning" shape="dot">
                            {outstanding} outstanding
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="success" shape="square">
                            Clear
                          </StatusBadge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
