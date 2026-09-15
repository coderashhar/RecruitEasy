import Link from "next/link";
import { PageHeader } from "@/components/broadsheet/section";
import { ScheduleFlow } from "@/components/schedule/schedule-flow";
import { getPotentialInterviewers, getSchedulableApplications } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string; round?: string }>;
}) {
  const { applicationId: prefillAppId, round: roundStr } = await searchParams;
  const parsedRound = roundStr ? parseInt(roundStr, 10) : 1;
  const round = Number.isInteger(parsedRound) && parsedRound >= 1 ? parsedRound : 1;

  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const [applications, interviewers] = await Promise.all([
    getSchedulableApplications(user.orgId),
    getPotentialInterviewers(user.orgId),
  ]);
  const prefill = applications.find((application) => application.id === prefillAppId);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Schedule an interview"
        description={
          prefill ? `Round ${round} · from ${prefill.candidate.name}'s application` : "Pick the panel first, then a time they are all free"
        }
        actions={
          <Link href="/recruiter/interviews" className="text-[13.5px] text-primary hover:underline">
            Cancel
          </Link>
        }
      />
      {applications.length === 0 ? (
        <p className="mt-[26px] border-t border-rule-strong py-5 text-sm text-muted-foreground">
          No applications to schedule yet.{" "}
          <Link href="/recruiter/applications/new" className="text-primary hover:underline">
            Add a candidate
          </Link>
        </p>
      ) : (
        <ScheduleFlow
          applications={applications.map((application) => ({
            id: application.id,
            candidateName: application.candidate.name,
            jobTitle: application.job.title,
          }))}
          interviewers={interviewers}
          prefillApplicationId={prefillAppId}
          round={round}
        />
      )}
    </div>
  );
}
