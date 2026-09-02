"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { InterviewStatus } from "@interviewhub/db";
import { changeInterviewStatus } from "@/app/recruiter/interviews/[id]/actions";

// Mirrors LEGAL_TRANSITIONS in interview-lifecycle.ts — kept here as a plain
// object rather than importing it, since that module has `import "server-only"`
// and this is a Client Component. The server re-validates every transition
// regardless; this only decides which buttons are worth showing.
const NEXT_STATUSES: Record<InterviewStatus, readonly InterviewStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const STATUS_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "Mark in progress",
  COMPLETED: "Mark completed",
  CANCELLED: "Cancel",
  NO_SHOW: "Mark no-show",
};

export function InterviewStatusActions({
  interviewId,
  status,
}: {
  interviewId: string;
  status: InterviewStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const nextStatuses = NEXT_STATUSES[status];

  if (nextStatuses.length === 0) return null;

  function moveTo(next: InterviewStatus) {
    const formData = new FormData();
    formData.set("interviewId", interviewId);
    formData.set("status", next);
    startTransition(() => {
      void changeInterviewStatus(formData);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "CANCELLED" || next === "NO_SHOW" ? "outline" : "secondary"}
          disabled={isPending}
          onClick={() => moveTo(next)}
        >
          {STATUS_LABEL[next]}
        </Button>
      ))}
    </div>
  );
}
