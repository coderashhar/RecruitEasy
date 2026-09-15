"use client";

import { useActionState, useRef, useState } from "react";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { SectionLabel } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitApplication } from "./actions";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(submitApplication, { error: null });
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section aria-labelledby="apply">
      <SectionLabel id="apply">Apply for this position</SectionLabel>
      <form action={formAction} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="jobId" value={jobId} />

        <button
          type="button"
          className={cn(
            "flex flex-col items-center gap-2 border border-dashed border-input px-6 py-9 text-center transition-colors hover:border-foreground hover:bg-muted/50",
            dragging && "border-primary bg-muted/50",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file && inputRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              inputRef.current.files = dt.files;
              setFileName(file.name);
            }
          }}
        >
          <span className="text-sm">
            {fileName ? (
              <span className="font-mono font-medium">{fileName}</span>
            ) : (
              <>
                <span className="font-medium text-primary">Upload your résumé</span>
                <span className="text-muted-foreground"> or drag it here</span>
              </>
            )}
          </span>
          <span className="font-mono text-[11.5px] text-muted-foreground">PDF or DOCX · up to 5 MB</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          name="resume"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setFileName(file?.name ?? null);
          }}
        />

        {state.error && <CalloutBanner tone="danger" title={state.error} role="alert" />}

        <div className="flex flex-col-reverse gap-3 border-t border-rule-strong pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-[11.5px] text-muted-foreground">Your résumé is scored against this job</span>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </div>
      </form>
    </section>
  );
}
