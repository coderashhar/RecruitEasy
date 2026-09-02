import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationStatus } from "@interviewhub/db";
import { ApplicationStatusSelect } from "@/components/pipeline/application-status-select";
import { getRecruiterPipeline, getUpcomingInterviews } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

// The full set of statuses the pipeline select offers. Typed against the real
// enum via `satisfies` so an added ApplicationStatus value is a compile error
// here, instead of silently missing from the dropdown.
const APPLICATION_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEWING",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const satisfies readonly ApplicationStatus[];

export default async function RecruiterDashboard() {
  const { user } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const [jobs, upcomingInterviews] = await Promise.all([
    getRecruiterPipeline(user.orgId),
    getUpcomingInterviews(user.orgId),
  ]);

  const applications = jobs.flatMap((job) =>
    job.applications.map((application) => ({ job, application })),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>
              {applications.length === 0
                ? "No candidates yet."
                : `${applications.length} application${applications.length === 1 ? "" : "s"} across ${jobs.length} job${jobs.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/recruiter/jobs/new">Post job</Link>}
            />
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/recruiter/applications/new">Add candidate</Link>}
            />
            <Button size="sm" render={<Link href="/recruiter/schedule">Schedule interview</Link>} />
          </div>
        </CardHeader>
        {applications.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>ATS score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map(({ job, application }) => {
                const latestReport = application.resumes[0]?.atsReports[0];
                return (
                  <TableRow key={application.id}>
                    <TableCell className="font-medium">{application.candidate.name}</TableCell>
                    <TableCell>{job.title}</TableCell>
                    <TableCell>
                      <ApplicationStatusSelect
                        applicationId={application.id}
                        status={application.status}
                        statuses={APPLICATION_STATUSES}
                      />
                    </TableCell>
                    <TableCell>{latestReport ? `${latestReport.score}/100` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
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
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>Completion rate and trends will show here.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
