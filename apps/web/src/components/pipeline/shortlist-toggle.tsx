"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleShortlist } from "@/app/recruiter/applications/actions";
import { cn } from "@/lib/utils";

/**
 * Star button. Updates optimistically and rolls back if the server refuses —
 * an interviewer, for instance, may see the pipeline but not change it.
 */
export function ShortlistToggle({
  applicationId,
  candidateName,
  shortlisted: initial,
  onChange,
  disabled,
}: {
  applicationId: string;
  candidateName: string;
  shortlisted: boolean;
  onChange?: (shortlisted: boolean) => void;
  /** Shows the state without offering to change it. */
  disabled?: boolean;
}) {
  const [shortlisted, setShortlisted] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !shortlisted;
    setShortlisted(next);
    onChange?.(next);

    startTransition(async () => {
      try {
        await toggleShortlist(applicationId, next);
      } catch (err) {
        setShortlisted(!next);
        onChange?.(!next);
        toast.error(err instanceof Error ? err.message : "Couldn't update the shortlist.");
      }
    });
  }

  if (disabled) {
    return shortlisted ? (
      <span className="inline-flex size-7 items-center justify-center text-primary" aria-label="Shortlisted">
        ★
      </span>
    ) : null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={shortlisted}
      aria-label={shortlisted ? `Remove ${candidateName} from shortlist` : `Shortlist ${candidateName}`}
      className={cn(
        "inline-flex size-7 items-center justify-center text-base leading-none transition-colors hover:text-primary disabled:opacity-60",
        shortlisted ? "text-primary" : "text-border hover:text-muted-foreground",
      )}
    >
      {shortlisted ? "★" : "☆"}
    </button>
  );
}
