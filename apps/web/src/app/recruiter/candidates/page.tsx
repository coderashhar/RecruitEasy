import { PageHeader } from "@/components/broadsheet/section";
import { PipelineTable, type PipelineRow } from "@/components/pipeline/pipeline-table";
import { getRecruiterPipeline } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

/**
 * The pipeline as an interviewer reads it: every candidate, comparable, but
 * without the controls that move applications — those stay with recruiters.
 */
export default async function CandidatesPage() {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const jobs = await getRecruiterPipeline(user.orgId);

  const rows: PipelineRow[] = jobs.flatMap((job) =>
    job.applications.map((application) => ({
      applicationId: application.id,
      candidateName: application.candidate.name,
      jobTitle: job.title,
      status: application.status,
      atsScore: application.resumes[0]?.atsReports[0]?.score ?? null,
      shortlisted: application.shortlistedAt !== null,
    })),
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Candidates"
        description={`${rows.length} application${rows.length === 1 ? "" : "s"} across ${jobs.length} job${jobs.length === 1 ? "" : "s"} · select two to four to compare`}
      />
      <div className="mt-[30px]">
        <PipelineTable rows={rows} canManage={role !== "INTERVIEWER"} />
      </div>
    </div>
  );
}
