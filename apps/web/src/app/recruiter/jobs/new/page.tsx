import { PageHeader } from "@/components/broadsheet/section";
import { requireCurrentUser } from "@/lib/users";
import { JobForm } from "./job-form";

export default async function NewJobPage() {
  await requireCurrentUser(["RECRUITER", "ADMIN"]);

  return (
    <div className="flex max-w-[680px] flex-col">
      <PageHeader title="Post a job" description="Candidates are added to a job before they can be interviewed" />
      <JobForm />
    </div>
  );
}
