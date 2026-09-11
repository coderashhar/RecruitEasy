"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitApplication } from "./actions";

export function ApplyForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(submitApplication, { error: null });
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apply for this position</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="jobId" value={jobId} />

          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              event.currentTarget.classList.add("border-primary");
            }}
            onDragLeave={(event) => {
              event.currentTarget.classList.remove("border-primary");
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.currentTarget.classList.remove("border-primary");
              const file = event.dataTransfer.files[0];
              if (file && inputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                inputRef.current.files = dt.files;
                setFileName(file.name);
              }
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-sm">
              {fileName ? (
                <span className="font-medium">{fileName}</span>
              ) : (
                <>
                  <span className="font-medium text-primary">Upload your resume</span>
                  <span className="text-muted-foreground"> or drag and drop</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PDF or DOCX, up to 5 MB</p>
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
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
