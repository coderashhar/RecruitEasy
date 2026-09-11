import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplicationStatus, InterviewStatus } from "@interviewhub/db";
import { getCandidateOverview } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

// Both typed against the real enums so an added status is a compile error
// here rather than silently falling through to a default look.
const APPLICATION_STATUS_VARIANT: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: "outline",
  SCREENING: "secondary",
  INTERVIEWING: "default",
  OFFER: "default",
  HIRED: "default",
  REJECTED: "destructive",
};

const INTERVIEW_STATUS_VARIANT: Record<InterviewStatus, BadgeVariant> = {
  SCHEDULED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

export default async function CandidateDashboard() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const { applications, upcomingInterviews, pastInterviews } = await getCandidateOverview(user.id);

  const latestReport = applications
    .flatMap((application) => application.resumes[0]?.atsReports[0] ?? [])
    .at(0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Upcoming interviews</CardTitle>
          <CardDescription>
            {upcomingInterviews.length === 0 ? "Nothing scheduled yet." : undefined}
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
                <div className="font-medium">{interview.application.job.title}</div>
                <div className="text-muted-foreground">
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

      <Card>
        <CardHeader>
          <CardTitle>Resume &amp; ATS score</CardTitle>
          <CardDescription>
            {latestReport ? undefined : "Upload a resume to get feedback."}
          </CardDescription>
        </CardHeader>
        {latestReport && (
          <div className="flex items-center gap-3 px-6 pb-6">
            <Badge>{latestReport.score}/100</Badge>
            {latestReport.missingKeywords.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Missing: {latestReport.missingKeywords.join(", ")}
              </span>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interview history</CardTitle>
          <CardDescription>
            {pastInterviews.length === 0 ? "No past interviews." : undefined}
          </CardDescription>
        </CardHeader>
        {pastInterviews.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {pastInterviews.map((interview) => (
              <div key={interview.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{interview.application.job.title}</div>
                  <div className="text-muted-foreground">
                    {interview.scheduledAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </div>
                </div>
                <Badge variant={INTERVIEW_STATUS_VARIANT[interview.status]}>
                  {interview.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      <Card className="sm:col-span-2 lg:col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Applications</CardTitle>
            <div className="flex items-center gap-3">
              <Link
                href="/candidate/notifications"
                className="text-sm font-medium text-primary hover:underline"
              >
                Notifications
              </Link>
              <Link
                href="/jobs"
                className="text-sm font-medium text-primary hover:underline"
              >
                Browse jobs
              </Link>
            </div>
          </div>
          <CardDescription>
            {applications.length === 0 ? "You haven't applied to anything yet." : undefined}
          </CardDescription>
        </CardHeader>
        {applications.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {applications.map((application) => {
              const hasReport = application.resumes[0]?.atsReports[0];
              return (
                <div key={application.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{application.job.title}</span>
                  <div className="flex items-center gap-2">
                    {hasReport && (
                      <Link
                        href={`/candidate/applications/${application.id}/ats`}
                        className="text-xs text-primary hover:underline"
                      >
                        ATS: {hasReport.score}/100
                      </Link>
                    )}
                    <Badge variant={APPLICATION_STATUS_VARIANT[application.status]}>
                      {application.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
