import Link from "next/link";
import { LocalTime } from "@/components/broadsheet/local-time";
import { ActNowPanel } from "@/components/broadsheet/panels";
import { relativeTime } from "@/components/broadsheet/relative-time";
import { FactRow, PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { CandidateApplicationRows } from "@/components/dashboard/candidate-lists";
import { Button } from "@/components/ui/button";
import { getCandidateDeletionRequest } from "@/lib/data-deletion";
import { INTEGRITY_DISCLOSURE } from "@/lib/integrity";
import { countCandidateRecordings, getCandidateOverview } from "@/lib/queries";
import { recordingRetentionDays } from "@/lib/retention";
import { requireCurrentUser } from "@/lib/users";

function greeting(name: string) {
  const first = name.split(" ")[0] || name;
  return `Hello, ${first}`;
}

export default async function CandidateDashboard() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const [{ applications, upcomingInterviews }, deletionRequest, recordings] = await Promise.all([
    getCandidateOverview(user.id),
    getCandidateDeletionRequest(user.id),
    countCandidateRecordings(user.id),
  ]);

  const now = new Date();
  const next = upcomingInterviews[0];
  const moving = applications.filter((application) => application.status !== "HIRED" && application.status !== "REJECTED");
  const retentionDays = recordingRetentionDays();

  const summary = [
    upcomingInterviews.length === 0
      ? "No interviews scheduled"
      : `${upcomingInterviews.length} interview${upcomingInterviews.length === 1 ? "" : "s"} coming up`,
    `${moving.length} application${moving.length === 1 ? "" : "s"} moving`,
  ].join(", ");

  return (
    <div className="flex flex-col">
      <PageHeader title={greeting(user.name)} description={summary} />

      {next && (
        <ActNowPanel
          className="mt-[26px]"
          live={next.status === "IN_PROGRESS" || next.scheduledAt.getTime() - now.getTime() < 60 * 60 * 1000}
          eyebrow={
            <>
              <LocalTime value={next.scheduledAt} format="weekdayTime" /> ·{" "}
              {next.status === "IN_PROGRESS" ? "in progress" : relativeTime(next.scheduledAt, now)}
            </>
          }
          title={next.application.job.title}
          detail={`Round ${next.round} · ${next.durationMins} min${next.participants.length > 0 ? ` · with ${next.participants.map((participant) => participant.user.name).join(", ")}` : ""}`}
          actions={
            <Button variant="paper" nativeButton={false} render={<Link href={`/interview/${next.id}`}>Open interview room</Link>} />
          }
        />
      )}
      {next && <p className="mt-3 text-[13px] text-muted-foreground">{INTEGRITY_DISCLOSURE.summary}</p>}

      <div className="mt-[30px] grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_316px]">
        <section aria-labelledby="applications">
          <SectionLabel id="applications" aside={applications.length > 0 && <Link href="/candidate/applications" className="text-primary">All</Link>}>
            Your applications
          </SectionLabel>
          {applications.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              You haven&apos;t applied to anything yet.{" "}
              <Link href="/jobs" className="text-primary hover:underline">
                Browse open jobs
              </Link>
            </p>
          ) : (
            <CandidateApplicationRows
              applications={applications.slice(0, 6).map((application) => ({
                ...application,
                atsScore: application.resumes[0]?.atsReports[0]?.score ?? null,
              }))}
            />
          )}
        </section>

        <div className="flex flex-col gap-[26px]">
          <section aria-labelledby="practice">
            <SectionLabel id="practice">Practice</SectionLabel>
            <p className="mt-3.5 text-[13.5px] leading-relaxed text-muted-foreground">
              Run a timed problem in the same editor you will use in the real interview. Nothing you do here is shared
              with employers.
            </p>
            <Button
              className="mt-3.5"
              variant="outline"
              nativeButton={false}
              render={<Link href="/candidate/practice">Start practising</Link>}
            />
          </section>

          <section aria-labelledby="data">
            <SectionLabel id="data">Your data</SectionLabel>
            <FactRow label="Recordings held">
              <span className="font-mono tabular-nums">{recordings}</span>
            </FactRow>
            {retentionDays !== null && (
              <FactRow label="Deleted after">
                <span className="font-mono">{retentionDays} days</span>
              </FactRow>
            )}
            <div className="mt-3 text-[13.5px]">
              {deletionRequest?.status === "PENDING" ? (
                <span className="text-muted-foreground">Deletion requested · waiting on an administrator</span>
              ) : (
                <Link href="/candidate/data" className="text-primary hover:underline">
                  Request deletion
                </Link>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
