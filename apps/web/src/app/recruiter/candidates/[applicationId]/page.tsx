import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplicationStatus, FeedbackRecommendation, InterviewStatus } from "@interviewhub/db";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { ApplicationStatusSelect } from "@/components/pipeline/application-status-select";
import { ShortlistToggle } from "@/components/pipeline/shortlist-toggle";
import { getApplicationProfile } from "@/lib/candidate-profile";
import { requireCurrentUser } from "@/lib/users";

const ALL_STATUSES: ApplicationStatus[] = ["APPLIED", "SCREENING", "INTERVIEWING", "OFFER", "HIRED", "REJECTED"];

const INTERVIEW_STATUS_VARIANT: Record<InterviewStatus, "default" | "secondary" | "outline" | "destructive"> = {
  SCHEDULED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

const RECOMMENDATION_LABEL: Record<FeedbackRecommendation, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no",
};

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  const profile = await getApplicationProfile(user.orgId, applicationId);
  if (!profile) notFound();

  // Pipeline decisions stay with recruiters and admins, as on the dashboard.
  const canManage = role === "RECRUITER" || role === "ADMIN";

  const resume = profile.resumes[0];
  const report = resume?.atsReports[0];
  const skillsMatch = report?.skillsMatch as
    | { matched: string[]; partial: string[]; missing: string[] }
    | undefined;
  const { feedbackSummary } = profile;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-1 text-lg">
              {canManage && (
                <ShortlistToggle
                  applicationId={profile.id}
                  candidateName={profile.candidate.name}
                  shortlisted={profile.shortlistedAt !== null}
                />
              )}
              {profile.candidate.name}
              {!canManage && profile.shortlistedAt && <Badge variant="secondary">Shortlisted</Badge>}
            </CardTitle>
            <CardDescription>
              {profile.job.title} · {profile.candidate.email} · applied{" "}
              {profile.createdAt.toLocaleDateString(undefined, { dateStyle: "medium" })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {resume && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a href={`/recruiter/candidates/${profile.id}/resume`} target="_blank" rel="noreferrer">
                    Resume
                  </a>
                }
              />
            )}
            {canManage ? (
              <ApplicationStatusSelect applicationId={profile.id} status={profile.status} statuses={ALL_STATUSES} />
            ) : (
              <Badge variant="outline">{profile.status}</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between text-base">
              <span>ATS match</span>
              {report && <span className="text-2xl font-semibold tabular-nums">{report.score}/100</span>}
            </CardTitle>
            <CardDescription>
              {report
                ? `Scored by ${report.source === "LLM" ? "AI" : "keyword analysis"} against the job's required skills.`
                : resume
                  ? "The resume is still being scored."
                  : "No resume on file."}
            </CardDescription>
          </CardHeader>
          {skillsMatch && (
            <CardContent className="flex flex-col gap-3 text-sm">
              {(["matched", "partial", "missing"] as const).map((group) =>
                skillsMatch[group].length > 0 ? (
                  <div key={group}>
                    <div className="mb-1 text-xs font-medium capitalize text-muted-foreground">{group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {skillsMatch[group].map((skill) => (
                        <Badge key={skill} variant={group === "missing" ? "outline" : "secondary"}>
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interviewer feedback</CardTitle>
            <CardDescription>
              {feedbackSummary.count === 0
                ? "No feedback submitted yet."
                : `Averaged across ${feedbackSummary.count} submission${feedbackSummary.count === 1 ? "" : "s"} from every round.`}
            </CardDescription>
          </CardHeader>
          {feedbackSummary.count > 0 && (
            <CardContent className="flex flex-col gap-4 text-sm">
              <div className="flex flex-col gap-2">
                {RUBRIC_CRITERIA.map(({ key, label }) => {
                  const average = feedbackSummary.averages[key];
                  return (
                    <div key={key} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3">
                      <span className="text-muted-foreground">{label}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${((average ?? 0) / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-right tabular-nums">{average ?? "—"}/5</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(RECOMMENDATION_LABEL) as FeedbackRecommendation[])
                  .filter((key) => feedbackSummary.recommendations[key] > 0)
                  .map((key) => (
                    <Badge key={key} variant={key === "NO" || key === "STRONG_NO" ? "outline" : "secondary"}>
                      {RECOMMENDATION_LABEL[key]} × {feedbackSummary.recommendations[key]}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interviews</CardTitle>
          <CardDescription>
            {profile.interviews.length === 0 ? "No interviews scheduled yet." : undefined}
          </CardDescription>
        </CardHeader>
        {profile.interviews.length > 0 && (
          <CardContent className="flex flex-col gap-3">
            {profile.interviews.map((interview) => (
              <div key={interview.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Round {interview.round}</span>
                    <Badge variant={INTERVIEW_STATUS_VARIANT[interview.status]}>{interview.status}</Badge>
                  </div>
                  <Link href={`/recruiter/interviews/${interview.id}`} className="text-primary hover:underline">
                    Details
                  </Link>
                </div>
                <div className="text-muted-foreground">
                  {interview.scheduledAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                  {interview.durationMins} min · with{" "}
                  {interview.participants.map((participant) => participant.user.name).join(", ") || "no interviewer"}
                  {interview._count.integritySignals > 0 &&
                    ` · ${interview._count.integritySignals} integrity signal${interview._count.integritySignals === 1 ? "" : "s"}`}
                </div>
                {interview.feedback.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {interview.feedback.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-baseline gap-2">
                        <span>{entry.interviewer.name}</span>
                        <Badge variant="secondary">{RECOMMENDATION_LABEL[entry.recommendation]}</Badge>
                        {entry.notes && (
                          <span className="min-w-0 truncate text-muted-foreground">{entry.notes}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
