import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PipelineTable, type PipelineRow } from "@/components/pipeline/pipeline-table";
import { getOrgAnalytics } from "@/lib/analytics";
import { getRecruiterPipeline, getUpcomingInterviews } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function RecruiterDashboard() {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const canSeeAnalytics = role === "RECRUITER" || role === "ADMIN";
  const [jobs, upcomingInterviews, analytics] = await Promise.all([
    getRecruiterPipeline(user.orgId),
    getUpcomingInterviews(user.orgId),
    canSeeAnalytics ? getOrgAnalytics(user.orgId, 30) : null,
  ]);

  const pipelineRows: PipelineRow[] = jobs.flatMap((job) =>
    job.applications.map((application) => ({
      applicationId: application.id,
      candidateName: application.candidate.name,
      jobTitle: job.title,
      status: application.status,
      atsScore: application.resumes[0]?.atsReports[0]?.score ?? null,
      shortlisted: application.shortlistedAt !== null,
    })),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>
              {pipelineRows.length === 0
                ? "No candidates yet."
                : `${pipelineRows.length} application${pipelineRows.length === 1 ? "" : "s"} across ${jobs.length} job${jobs.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {role === "ADMIN" && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href="/admin/audit">Admin</Link>}
              />
            )}
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/recruiter/jobs/new">Post job</Link>}
            />
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/recruiter/applications/new">Add candidate</Link>}
            />
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/recruiter/schedule">Schedule interview</Link>}
            />
          </div>
        </CardHeader>
        {pipelineRows.length > 0 && <PipelineTable rows={pipelineRows} />}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled interviews</CardTitle>
          <CardDescription>
            {upcomingInterviews.length === 0
              ? "Nothing on the calendar."
              : `${upcomingInterviews.length} upcoming.`}
          </CardDescription>
        </CardHeader>
        {upcomingInterviews.length > 0 && (
          <div className="flex flex-col gap-3 px-6 pb-6">
            {upcomingInterviews.map((interview) => (
              <div key={interview.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{interview.application.candidate.name}</div>
                <div className="text-muted-foreground">
                  {interview.application.job.title} ·{" "}
                  {interview.scheduledAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
                <div className="mt-2 flex gap-3">
                  <Link href={`/interview/${interview.id}`} className="underline">
                    Join call
                  </Link>
                  <Link href={`/recruiter/interviews/${interview.id}`} className="underline">
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {analytics && (
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Last 30 days</CardTitle>
              <CardDescription>Interview completion, hires and the open pipeline.</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/recruiter/analytics">View analytics</Link>}
            />
          </CardHeader>
          <div className="grid gap-3 px-6 pb-6 sm:grid-cols-3">
            {[
              {
                label: "Interview completion",
                value:
                  analytics.interviews.completionRate === null
                    ? "—"
                    : `${Math.round(analytics.interviews.completionRate * 100)}%`,
              },
              { label: "Hires", value: String(analytics.hires) },
              { label: "Active applications", value: String(analytics.activeApplications) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{stat.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
