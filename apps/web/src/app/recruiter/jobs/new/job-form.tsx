"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { ActionFooter, Eyebrow } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createJob, type JobFormState } from "./actions";

// Plain <textarea>, styled to match Input: there is no shadcn textarea
// primitive in the project, and this form posts FormData to a Server Action.
const textareaClassName =
  "mt-[9px] min-h-36 w-full min-w-0 border border-input bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const INITIAL: JobFormState = { error: null };

export function JobForm() {
  const [state, formAction, pending] = useActionState(createJob, INITIAL);

  return (
    <form action={formAction} className="mt-7 flex flex-col gap-6 border-t border-rule-strong pt-6">
      {/* Above the fields, where the eye already is after pressing Post job. */}
      {state.error && (
        <CalloutBanner tone="danger" role="alert" title="The job wasn't posted">
          {state.error}
        </CalloutBanner>
      )}

      <label className="block">
        <Eyebrow>Title</Eyebrow>
        <Input name="title" required maxLength={200} placeholder="Backend Engineer" className="mt-[9px] h-[38px]" />
      </label>
      <label className="block">
        <Eyebrow>Description</Eyebrow>
        <textarea
          name="description"
          required
          maxLength={10_000}
          className={textareaClassName}
          placeholder="What this person will own."
        />
      </label>
      <label className="block">
        <Eyebrow>Required skills</Eyebrow>
        <Input name="requiredSkills" placeholder="TypeScript, PostgreSQL, Docker" className="mt-[9px] h-[38px]" />
        <span className="mt-[7px] block font-mono text-[11.5px] text-muted-foreground">
          comma-separated · optional · ATS scoring reads these
        </span>
      </label>
      <ActionFooter note="job.created is recorded in the audit log">
        <Button variant="outline" nativeButton={false} render={<Link href="/recruiter/jobs">Cancel</Link>} />
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post job"}
        </Button>
      </ActionFooter>
    </form>
  );
}
