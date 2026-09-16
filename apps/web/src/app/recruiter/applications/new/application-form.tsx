"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { ActionFooter, Eyebrow } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { createApplication, type ApplicationFormState } from "./actions";

// Native <select>: this form posts FormData to a Server Action, and the
// shadcn Select primitive is controlled-only with no `name` wired to native
// form submission.
const selectClassName =
  "mt-[9px] h-[38px] w-full min-w-0 border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const INITIAL: ApplicationFormState = { error: null };

export function ApplicationForm({
  jobs,
  candidates,
}: {
  jobs: Array<{ id: string; title: string }>;
  candidates: Array<{ id: string; name: string; email: string }>;
}) {
  const [state, formAction, pending] = useActionState(createApplication, INITIAL);
  const blocked = jobs.length === 0 || candidates.length === 0;

  return (
    <form action={formAction} className="mt-7 flex flex-col gap-6 border-t border-rule-strong pt-6">
      {state.error && (
        <CalloutBanner tone="danger" role="alert" title="The candidate wasn't added">
          {state.error}
        </CalloutBanner>
      )}

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
        <Button type="submit" disabled={blocked || pending}>
          {pending ? "Adding…" : "Add candidate"}
        </Button>
      </ActionFooter>
    </form>
  );
}
