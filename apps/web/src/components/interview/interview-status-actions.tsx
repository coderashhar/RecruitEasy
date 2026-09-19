"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { InterviewStatus } from "@interviewhub/db";
import { SideEffectList } from "@/components/broadsheet/panels";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogEyebrow,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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

interface Confirmation {
  eyebrow: string;
  title: string;
  description: string;
  effects: ReactNode[];
  confirmLabel: string;
  keepLabel: string;
  note: string;
  variant: "destructive" | "strong";
}

export function InterviewStatusActions({
  interviewId,
  status,
  candidateName,
  round,
  allowed,
}: {
  interviewId: string;
  status: InterviewStatus;
  candidateName: string;
  round: number;
  /** Narrows the moves offered, e.g. to what an interviewer may do. The server enforces the same limit. */
  allowed?: readonly InterviewStatus[];
}) {
  const [isPending, startTransition] = useTransition();
  const nextStatuses = NEXT_STATUSES[status].filter((next) => !allowed || allowed.includes(next));

  if (nextStatuses.length === 0) return null;

  function moveTo(next: InterviewStatus) {
    const formData = new FormData();
    formData.set("interviewId", interviewId);
    formData.set("status", next);

    // The transition callback must await the action. A synchronous callback
    // that merely fires it off resolves immediately, so `isPending` never
    // engages (a double-click sends two writes) and a rejection — an illegal
    // transition, say, because someone else completed this interview first —
    // surfaces nowhere at all.
    startTransition(async () => {
      try {
        await changeInterviewStatus(formData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update the interview.");
      }
    });
  }

  // Terminal moves that tell people things state it before they happen.
  const confirmations: Partial<Record<InterviewStatus, Confirmation>> = {
    CANCELLED: {
      eyebrow: "Cancel · terminal",
      title: `Cancel ${candidateName}'s round ${round}?`,
      description:
        "A cancelled interview cannot be reopened — scheduling again creates a new one. The application keeps its current status.",
      effects: [
        "Email everyone invited a cancellation that removes it from their calendar",
        "Stop the reminders, and any recording still running",
        <>
          Record <span className="font-mono text-[12.5px]">interview.status_changed</span> in the audit log
        </>,
      ],
      confirmLabel: "Cancel interview",
      keepLabel: "Keep it",
      note: "Only scheduled or live interviews can be cancelled",
      variant: "destructive",
    },
    NO_SHOW: {
      eyebrow: "No-show · terminal",
      title: `${candidateName} did not join`,
      description:
        "Marking a no-show closes the interview. It counts against completion in analytics, and cannot be undone.",
      effects: [
        "Close the interview and stop any recording still running",
        "Send nothing to the candidate",
      ],
      confirmLabel: "Mark no-show",
      keepLabel: "Keep waiting",
      note: "Give them a few minutes past the start first",
      variant: "strong",
    },
  };

  const labels: Partial<Record<InterviewStatus, string>> = {
    IN_PROGRESS: "Mark in progress",
    COMPLETED: "Mark completed",
  };

  return (
    <div className="flex flex-wrap gap-2.5">
      {nextStatuses.map((next) => {
        const confirmation = confirmations[next];
        if (!confirmation) {
          return (
            <Button key={next} variant={next === "COMPLETED" ? "ink" : "outline"} disabled={isPending} onClick={() => moveTo(next)}>
              {labels[next]}
            </Button>
          );
        }
        return (
          <AlertDialog key={next}>
            <AlertDialogTrigger render={<Button variant="outline" disabled={isPending} />}>
              {confirmation.confirmLabel}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogEyebrow>{confirmation.eyebrow}</AlertDialogEyebrow>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
              <div className="mt-5">
                <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">This will</div>
                <SideEffectList className="mt-2.5" items={confirmation.effects} />
              </div>
              <AlertDialogFooter note={confirmation.note}>
                <AlertDialogClose render={<Button variant="outline" />}>{confirmation.keepLabel}</AlertDialogClose>
                <AlertDialogClose render={<Button variant={confirmation.variant} onClick={() => moveTo(next)} />}>
                  {confirmation.confirmLabel}
                </AlertDialogClose>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })}
    </div>
  );
}
