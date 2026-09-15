import { LocalTime } from "@/components/broadsheet/local-time";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { FactRow, PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { RequestDeletionButton } from "@/components/privacy/request-deletion-button";
import { getCandidateDeletionRequest } from "@/lib/data-deletion";
import { INTEGRITY_DISCLOSURE } from "@/lib/integrity";
import { countCandidateRecordings, getCandidateOverview } from "@/lib/queries";
import { recordingRetentionDays } from "@/lib/retention";
import { requireCurrentUser } from "@/lib/users";

export default async function YourDataPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const [{ applications, pastInterviews, upcomingInterviews }, deletionRequest, recordings] = await Promise.all([
    getCandidateOverview(user.id),
    getCandidateDeletionRequest(user.id),
    countCandidateRecordings(user.id),
  ]);
  const retentionDays = recordingRetentionDays();

  return (
    <div className="flex max-w-[880px] flex-col">
      <PageHeader title="Your data" description="What InterviewHub holds about you, and how to have it deleted" />

      <section aria-labelledby="held" className="mt-[30px]">
        <SectionLabel id="held">Held about you</SectionLabel>
        <FactRow label="Applications, with résumés and ATS reports">
          <span className="font-mono tabular-nums">{applications.length}</span>
        </FactRow>
        <FactRow label="Interviews, with code, chat and feedback">
          <span className="font-mono tabular-nums">{pastInterviews.length + upcomingInterviews.length}</span>
        </FactRow>
        <FactRow label="Recordings">
          <span className="font-mono tabular-nums">{recordings}</span>
        </FactRow>
        <FactRow label="Recordings deleted after">
          <span className="font-mono">{retentionDays === null ? "kept until you ask" : `${retentionDays} days`}</span>
        </FactRow>
      </section>

      <section aria-labelledby="integrity" className="mt-10">
        <SectionLabel id="integrity">During interviews</SectionLabel>
        <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {INTEGRITY_DISCLOSURE.summary} {INTEGRITY_DISCLOSURE.detail}
        </p>
      </section>

      <section aria-labelledby="deletion" className="mt-10">
        <SectionLabel id="deletion">Deletion</SectionLabel>
        <div className="mt-4 flex flex-col gap-4">
          {deletionRequest?.status === "PENDING" ? (
            <CalloutBanner tone="info" title="Deletion requested">
              You asked on <LocalTime value={deletionRequest.requestedAt} format="date" />. Nothing is deleted until an
              administrator acts on it, and you will be signed out when they do.
            </CalloutBanner>
          ) : (
            <>
              {deletionRequest?.status === "REJECTED" && (
                <CalloutBanner tone="warning" title="Your last request was declined">
                  &ldquo;{deletionRequest.reason ?? "No reason given."}&rdquo; You can ask again.
                </CalloutBanner>
              )}
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Once an administrator approves it, your account, applications, résumés, ATS reports, interview
                recordings, code and chat are permanently deleted. This cannot be undone.
              </p>
              <div>
                <RequestDeletionButton />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
