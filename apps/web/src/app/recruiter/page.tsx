import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
import { getRecruiterPipeline, getUpcomingInterviews } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

// Typed against the real enum (not Record<string, ...>) so a new
// ApplicationStatus value is a compile error here until it's given a variant,
// instead of silently falling through to a default look.
const STATUS_VARIANT: Record<ApplicationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  APPLIED: "outline",
  SCREENING: "secondary",
  INTERVIEWING: "default",
  OFFER: "default",
  HIRED: "default",
  REJECTED: "destructive",
};

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
                      <Badge variant={STATUS_VARIANT[application.status]}>
                        {application.status}
                      </Badge>
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
              <Link
                key={interview.id}
                href={`/interview/${interview.id}`}
                className="rounded-md border p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="font-medium">{interview.application.candidate.name}</div>
                <div className="text-muted-foreground">
                  {interview.application.job.title} ·{" "}
                  {interview.scheduledAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              </Link>
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
