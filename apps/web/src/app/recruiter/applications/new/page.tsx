import Link from "next/link";
import { ActionFooter, Eyebrow, PageHeader } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { getCandidatesInOrg, getJobsInOrg } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { createApplication } from "./actions";

// Native <select>: this form submits uncontrolled via a Server Action, and the
// shadcn Select primitive is controlled-only with no `name` wired to native
// form submission.
const selectClassName =
  "mt-[9px] h-[38px] w-full min-w-0 border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function NewApplicationPage() {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const [jobs, candidates] = await Promise.all([
    getJobsInOrg(user.orgId),
    getCandidatesInOrg(user.orgId),
  ]);

  const blocked = jobs.length === 0 || candidates.length === 0;

  return (
    <div className="flex max-w-[680px] flex-col">
      <PageHeader
        title="Add a candidate"
        description="Attaches a candidate to a job so they can be scheduled for an interview"
      />
      <form action={createApplication} className="mt-7 flex flex-col gap-6 border-t border-rule-strong pt-6">
        <label className="block">
          <Eyebrow>Job</Eyebrow>
          {jobs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No jobs yet —{" "}
              <Link className="text-primary hover:underline" href="/recruiter/jobs/new">
                post one first
              </Link>
              .
            </p>
          ) : (
            <select name="jobId" required className={selectClassName}>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="block">
          <Eyebrow>Candidate</Eyebrow>
          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No candidate accounts in this organisation yet. A candidate has to sign up and pick the Candidate role
              before they can be added.
            </p>
          ) : (
            <select name="candidateId" required className={selectClassName}>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.email})
                </option>
              ))}
            </select>
          )}
        </label>

        <ActionFooter note="application.created is recorded in the audit log">
          <Button variant="outline" nativeButton={false} render={<Link href="/recruiter">Cancel</Link>} />
          <Button type="submit" disabled={blocked}>
            Add candidate
          </Button>
        </ActionFooter>
      </form>
    </div>
  );
}
