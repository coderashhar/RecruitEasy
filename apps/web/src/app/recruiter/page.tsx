import Link from "next/link";
import { InterviewerToday } from "@/components/dashboard/interviewer-today";
import { StatMeasure, StatRow } from "@/components/broadsheet/measures";
import { LocalTime } from "@/components/broadsheet/local-time";
import { ActNowPanel } from "@/components/broadsheet/panels";
import { relativeTime } from "@/components/broadsheet/relative-time";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { PipelineTable, type PipelineRow } from "@/components/pipeline/pipeline-table";
import { getOrgAnalytics } from "@/lib/analytics";
import { getRecruiterPipeline, getUpcomingInterviews } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

/** How far ahead an interview you are sitting in becomes the thing to act on. */
const ACT_NOW_WINDOW_MS = 60 * 60 * 1000;

export default async function RecruiterDashboard() {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  // Same shell, different first screen: an interviewer's day is their
  // schedule and the feedback they owe, not the org's pipeline.
  if (role === "INTERVIEWER") return <InterviewerToday user={user} />;

  const [jobs, upcomingInterviews, analytics] = await Promise.all([
    getRecruiterPipeline(user.orgId),
    getUpcomingInterviews(user.orgId),
    getOrgAnalytics(user.orgId, 30),
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

  const now = new Date();
  // Only an interview you are in can be joined from here; the room admits
  // participants alone.
  const actNow = upcomingInterviews.find(
    (interview) =>
      interview.participants.some((participant) => participant.userId === user.id) &&
      (interview.status === "IN_PROGRESS" || interview.scheduledAt.getTime() - now.getTime() <= ACT_NOW_WINDOW_MS),
  );
  const nextUp = upcomingInterviews.filter((interview) => interview.id !== actNow?.id).slice(0, 5);
  const rate = analytics.interviews.completionRate;
  const panel = actNow?.participants.filter((participant) => participant.role === "INTERVIEWER") ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pipeline"
        description={
          pipelineRows.length === 0
            ? "No applications yet."
            : `${pipelineRows.length} application${pipelineRows.length === 1 ? "" : "s"} across ${jobs.length} job${jobs.length === 1 ? "" : "s"}`
        }
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/recruiter/jobs/new">Post job</Link>} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/recruiter/applications/new">Add candidate</Link>}
            />
            <Button nativeButton={false} render={<Link href="/recruiter/schedule">Schedule interview</Link>} />
          </>
        }
      />

      <StatRow className="mt-[30px]">
        <StatMeasure
          label="Interview completion"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          muted={rate === null}
        />
        <StatMeasure label="Hires · 30 days" value={analytics.hires} />
        <StatMeasure label="Active applications" value={analytics.activeApplications} />
      </StatRow>

      <div className="mt-[34px] grid items-start gap-12 xl:grid-cols-[minmax(0,1fr)_316px]">
        <div className="min-w-0">
          {actNow && (
            <ActNowPanel
              className="mb-7"
              live
              title={`${actNow.application.candidate.name} · ${actNow.application.job.title}`}
              detail={
                <>
                  {actNow.status === "IN_PROGRESS" ? "In progress" : `Starts ${relativeTime(actNow.scheduledAt, now)}`} ·{" "}
                  {actNow.durationMins} min
                  {panel.length > 0 && ` · ${panel.map((participant) => (participant.userId === user.id ? "you" : participant.user.name)).join(" and ")}`}
                </>
              }
              actions={
                <Button
                  variant="paper"
                  nativeButton={false}
                  render={<Link href={`/interview/${actNow.id}`}>Join interview</Link>}
                />
              }
            />
          )}
          <PipelineTable rows={pipelineRows} />
        </div>

        <section aria-labelledby="next-up">
          <SectionLabel id="next-up">Next up</SectionLabel>
          {nextUp.length === 0 ? (
            <p className="py-3.5 text-sm text-muted-foreground">Nothing else on the calendar.</p>
          ) : (
            nextUp.map((interview) => (
              <div key={interview.id} className="border-b border-hairline py-3.5 last:border-b-0">
                <div className="text-sm font-medium">{interview.application.candidate.name}</div>
                <div className="mt-[3px] text-[13px] text-muted-foreground">
                  {interview.application.job.title} · <LocalTime value={interview.scheduledAt} format="weekdayTime" />
                </div>
                <div className="mt-2 flex gap-4 text-[13px]">
                  <Link href={`/recruiter/interviews/${interview.id}`} className="text-primary hover:underline">
                    Details
                  </Link>
                  {interview.participants.some((participant) => participant.userId === user.id) && (
                    <Link href={`/interview/${interview.id}`} className="text-primary hover:underline">
                      Join
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
