import { PageHeader } from "@/components/broadsheet/section";
import { getCandidatesInOrg, getJobsInOrg } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { ApplicationForm } from "./application-form";

export default async function NewApplicationPage() {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const [jobs, candidates] = await Promise.all([
    getJobsInOrg(user.orgId),
    getCandidatesInOrg(user.orgId),
  ]);

  return (
    <div className="flex max-w-[680px] flex-col">
      <PageHeader
        title="Add a candidate"
        description="Attaches a candidate to a job so they can be scheduled for an interview"
      />
      <ApplicationForm jobs={jobs} candidates={candidates} />
    </div>
  );
}
