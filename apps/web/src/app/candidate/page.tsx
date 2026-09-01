import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCandidateOverview } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function CandidateDashboard() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const { applications, upcomingInterviews } = await getCandidateOverview(user.id);

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
            {applications.length === 0
              ? "No past interviews."
              : `${applications.length} application${applications.length === 1 ? "" : "s"} on file.`}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
