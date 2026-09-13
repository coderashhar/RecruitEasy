import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarList, WeeklyColumns } from "@/components/analytics/charts";
import { ANALYTICS_RANGES, getOrgAnalytics, parseRange } from "@/lib/analytics";
import { requireCurrentUser } from "@/lib/users";

const STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Hiring analytics</h1>
          <p className="text-sm text-muted-foreground">
            Last {range} days, through today. The pipeline and ATS figures are as of now.
          </p>
        </div>
        <nav aria-label="Date range" className="flex rounded-md border p-0.5 text-sm">
          {ANALYTICS_RANGES.map((option) => (
            <Link
              key={option}
              href={`/recruiter/analytics?range=${option}`}
              aria-current={option === range ? "page" : undefined}
              className={`rounded px-3 py-1 ${option === range ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {option} days
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Interview completion"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          detail={
            rate === null
              ? "No interview outcomes recorded yet."
              : `${interviews.counts.COMPLETED ?? 0} completed · ${interviews.counts.NO_SHOW ?? 0} no-show · ${interviews.counts.CANCELLED ?? 0} cancelled`
          }
        />
        <Stat
          label="Hires"
          value={String(analytics.hires)}
          detail={`Moved to Hired in the last ${range} days.`}
        />
        <Stat
          label="Active applications"
          value={String(analytics.activeApplications)}
          detail="Not yet hired or rejected."
        />
      </div>

      {interviews.unrecorded > 0 && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {interviews.unrecorded} interview{interviews.unrecorded === 1 ? " is" : "s are"} past {interviews.unrecorded === 1 ? "its" : "their"} slot but
          still marked scheduled or in progress, so {interviews.unrecorded === 1 ? "it isn't" : "they aren't"} counted in the completion rate. Mark{" "}
          {interviews.unrecorded === 1 ? "it" : "them"} completed, no-show or cancelled to include {interviews.unrecorded === 1 ? "it" : "them"}.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New applications</CardTitle>
            <CardDescription>
              {analytics.applicationsPerWeek.reduce((sum, week) => sum + week.count, 0)} in the last {range} days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyColumns weeks={analytics.applicationsPerWeek} label="New applications per week" unit="applications" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hires</CardTitle>
            <CardDescription>Applications moved to Hired, by the week it happened.</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyColumns weeks={analytics.hiresPerWeek} label="Hires per week" unit="hires" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline now</CardTitle>
            <CardDescription>Every application in the organisation, by current status.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              label="Applications by status"
              items={analytics.funnel.map((step) => ({
                key: step.status,
                label: STATUS_LABEL[step.status],
                value: step.count,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ATS score by job</CardTitle>
            <CardDescription>Average of each application&apos;s latest score, out of 100.</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.atsByJob.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs posted yet.</p>
            ) : (
              <BarList
                label="Average ATS score by job"
                max={100}
                items={analytics.atsByJob.map((job) => ({
                  key: job.jobId,
                  label: job.title,
                  value: job.averageScore,
                  note: `${job.scored}/${job.applications} scored`,
                }))}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interviewers</CardTitle>
          <CardDescription>
            Interviews scheduled in the last {range} days. Feedback counts only completed interviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.interviewers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interviews in this range.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Interviewer</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Feedback given</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.interviewers.map((interviewer) => (
                  <TableRow key={interviewer.name}>
                    <TableCell className="font-medium">{interviewer.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{interviewer.scheduled}</TableCell>
                    <TableCell className="text-right tabular-nums">{interviewer.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {interviewer.feedbackGiven} of {interviewer.completed}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
