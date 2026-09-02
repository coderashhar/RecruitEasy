import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getCandidatesInOrg, getJobsInOrg } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { createApplication } from "./actions";

// Native <select> for the same reason as the schedule page: this form submits
// uncontrolled via a Server Action, and the shadcn Select primitive is
// controlled-only with no `name` wired to native form submission.
const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function NewApplicationPage() {
  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const [jobs, candidates] = await Promise.all([
    getJobsInOrg(user.orgId),
    getCandidatesInOrg(user.orgId),
  ]);

  const blocked = jobs.length === 0 || candidates.length === 0;

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Add a candidate</CardTitle>
          <CardDescription>
            Attaches a candidate to a job so they can be scheduled for an interview.
          </CardDescription>
        </CardHeader>
        <form action={createApplication} className="flex flex-col gap-5 px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jobId">Job</Label>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No jobs yet — <Link className="underline" href="/recruiter/jobs/new">post one first</Link>.
              </p>
            ) : (
              <select id="jobId" name="jobId" required className={selectClassName}>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="candidateId">Candidate</Label>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No candidate accounts in this organization yet. A candidate has to sign up and
                pick the Candidate role before they can be added.
              </p>
            ) : (
              <select id="candidateId" name="candidateId" required className={selectClassName}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          <Button type="submit" disabled={blocked}>
            Add candidate
          </Button>
        </form>
      </Card>
    </div>
  );
}
