import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { CandidateInterviewRows } from "@/components/dashboard/candidate-lists";
import { INTEGRITY_DISCLOSURE } from "@/lib/integrity";
import { getCandidateOverview } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function CandidateInterviewsPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const { upcomingInterviews, pastInterviews } = await getCandidateOverview(user.id);

  return (
    <div className="flex flex-col">
      <PageHeader title="Interviews" description="Times shown in your timezone" />

      <section aria-labelledby="upcoming" className="mt-[30px]">
        <SectionLabel id="upcoming">Upcoming</SectionLabel>
        {upcomingInterviews.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing scheduled yet. Invites arrive by email too.</p>
        ) : (
          <>
            <CandidateInterviewRows interviews={upcomingInterviews} joinable />
            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {INTEGRITY_DISCLOSURE.summary} {INTEGRITY_DISCLOSURE.detail}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="past" className="mt-10">
        <SectionLabel id="past">History</SectionLabel>
        {pastInterviews.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No past interviews.</p>
        ) : (
          <CandidateInterviewRows interviews={pastInterviews} />
        )}
      </section>
    </div>
  );
}
