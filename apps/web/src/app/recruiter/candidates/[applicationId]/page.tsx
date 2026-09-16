import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApplicationStatus } from "@interviewhub/db";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { LocalTime } from "@/components/broadsheet/local-time";
import { StatMeasure, StatRow } from "@/components/broadsheet/measures";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import {
  ApplicationStatusBadge,
  InterviewStatusBadge,
  RECOMMENDATION,
  RECOMMENDATION_ORDER,
  RecommendationBadge,
} from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { ApplicationStatusSelect } from "@/components/pipeline/application-status-select";
import { ShortlistToggle } from "@/components/pipeline/shortlist-toggle";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { getApplicationProfile } from "@/lib/candidate-profile";
import { parseResumeIssue, resumeIssueCopy } from "@/lib/resume-availability";
import { requireCurrentUser } from "@/lib/users";

const ALL_STATUSES: ApplicationStatus[] = ["APPLIED", "SCREENING", "INTERVIEWING", "OFFER", "HIRED", "REJECTED"];

const SKILL_GROUP_LABEL = { matched: "Matched", partial: "Partial", missing: "Missing" } as const;

export default async function CandidateProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  /** `?resume=` is set when the download route had nothing to serve. */
  searchParams: Promise<{ resume?: string | string[] }>;
}) {
  const [{ applicationId }, { resume: resumeParam }] = await Promise.all([params, searchParams]);
  const resumeIssue = parseResumeIssue(resumeParam);
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
    <div className="flex max-w-[1040px] flex-col">
      <PageHeader
        eyebrow={profile.job.title}
        title={
          <span className="inline-flex items-center gap-1">
            {canManage ? (
              <ShortlistToggle
                applicationId={profile.id}
                candidateName={profile.candidate.name}
                shortlisted={profile.shortlistedAt !== null}
              />
            ) : (
              profile.shortlistedAt && <span className="text-primary">★</span>
            )}
            {profile.candidate.name}
          </span>
        }
        description={
          <>
            {profile.candidate.email} · applied <LocalTime value={profile.createdAt} format="date" />
          </>
        }
        actions={
          <>
            {resume && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={`/recruiter/candidates/${profile.id}/resume`} target="_blank" rel="noreferrer">
                    Résumé
                  </a>
                }
              />
            )}
            {canManage ? (
              <ApplicationStatusSelect applicationId={profile.id} status={profile.status} statuses={ALL_STATUSES} />
            ) : (
              <ApplicationStatusBadge status={profile.status} />
            )}
            {canManage && (
              <Button
                nativeButton={false}
                render={<Link href={`/recruiter/schedule?applicationId=${profile.id}&round=${profile.interviews.length + 1}`}>Schedule interview</Link>}
              />
            )}
          </>
        }
      />

      {resumeIssue && (
        <CalloutBanner
          className="mt-6"
          role="status"
          tone={resumeIssue === "none" ? "info" : "warning"}
          title={resumeIssueCopy(resumeIssue).title}
        >
          {resumeIssueCopy(resumeIssue).detail}
        </CalloutBanner>
      )}

      <StatRow className="mt-7">
        <StatMeasure
          label="ATS match"
          value={report ? report.score : "—"}
          muted={!report}
          detail={
            report
              ? `out of 100 · scored by ${report.source === "LLM" ? "AI" : "keyword analysis"}`
              : resume
                ? "The résumé is still being scored"
                : "No résumé on file"
          }
        />
        <StatMeasure
          label="Feedback"
          value={feedbackSummary.count}
          detail={feedbackSummary.count === 0 ? "No submissions yet" : "submissions, averaged across every round"}
        />
        <StatMeasure
          label="Interviews"
          value={profile.interviews.length}
          detail={`${profile.interviews.filter((interview) => interview.status === "COMPLETED").length} completed`}
        />
      </StatRow>

      <div className="mt-9 grid items-start gap-12 md:grid-cols-2">
        <section aria-labelledby="skills">
          <SectionLabel id="skills">Skills against the job</SectionLabel>
          {!skillsMatch ? (
            <p className="py-4 text-sm text-muted-foreground">No breakdown yet.</p>
          ) : (
            (["matched", "partial", "missing"] as const).map((group) => (
              <div key={group} className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 border-b border-hairline py-3 text-[13.5px] last:border-b-0">
                <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                  {SKILL_GROUP_LABEL[group]}
                </span>
                <span className={group === "missing" ? "text-muted-foreground" : ""}>
                  {skillsMatch[group].length > 0 ? skillsMatch[group].join(", ") : "—"}
                </span>
              </div>
            ))
          )}
        </section>

        <section aria-labelledby="rubric">
          <SectionLabel id="rubric" aside={feedbackSummary.count > 0 ? "average of 5" : undefined}>
            Interviewer feedback
          </SectionLabel>
          {feedbackSummary.count === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No feedback submitted yet.</p>
          ) : (
            <>
              {RUBRIC_CRITERIA.map(({ key, label }) => {
                const average = feedbackSummary.averages[key];
                return (
                  <div key={key} className="grid grid-cols-[120px_1fr_48px] items-center gap-3.5 border-b border-hairline py-[9px] text-[13.5px]">
                    <span>{label}</span>
                    <span className="block h-[9px] bg-hairline" aria-hidden="true">
                      {average !== null && (
                        <span className="block h-[9px] bg-foreground" style={{ width: `${(average / 5) * 100}%` }} />
                      )}
                    </span>
                    <span className="text-right font-mono tabular-nums">{average ?? "—"}</span>
                  </div>
                );
              })}
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {[...RECOMMENDATION_ORDER]
                  .reverse()
                  .filter((key) => feedbackSummary.recommendations[key] > 0)
                  .map((key) => (
                    <RecommendationBadge key={key} recommendation={key}>
                      {feedbackSummary.recommendations[key]} × {RECOMMENDATION[key].label}
                    </RecommendationBadge>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="interviews" className="mt-10">
        <SectionLabel id="interviews">Interviews</SectionLabel>
        {profile.interviews.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No interviews scheduled yet.</p>
        ) : (
          profile.interviews.map((interview) => (
            <article key={interview.id} className="border-b border-hairline py-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Link href={`/recruiter/interviews/${interview.id}`} className="text-[14.5px] font-semibold hover:underline">
                    Round {interview.round}
                  </Link>
                  <InterviewStatusBadge status={interview.status} />
                </div>
                <LocalTime value={interview.scheduledAt} format="weekdayTime" className="font-mono text-[12.5px] text-muted-foreground" />
              </div>
              <div className="mt-1.5 text-[13px] text-muted-foreground">
                {interview.durationMins} min · with{" "}
                {interview.participants.map((participant) => participant.user.name).join(", ") || "no interviewer"}
                {interview._count.integritySignals > 0 &&
                  ` · ${interview._count.integritySignals} integrity signal${interview._count.integritySignals === 1 ? "" : "s"}`}
              </div>
              {interview.feedback.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {interview.feedback.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-2.5 text-[13.5px]">
                      <span>{entry.interviewer.name}</span>
                      <RecommendationBadge recommendation={entry.recommendation} />
                      {entry.notes && <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.notes}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
