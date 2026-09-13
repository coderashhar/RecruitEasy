"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleShortlist } from "@/app/recruiter/applications/actions";

/**
 * Star button. Updates optimistically and rolls back if the server refuses —
 * an interviewer, for instance, may see the pipeline but not change it.
 */
export function ShortlistToggle({
  applicationId,
  candidateName,
  shortlisted: initial,
  onChange,
}: {
  applicationId: string;
  candidateName: string;
  shortlisted: boolean;
  onChange?: (shortlisted: boolean) => void;
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={shortlisted}
      aria-label={shortlisted ? `Remove ${candidateName} from shortlist` : `Shortlist ${candidateName}`}
      title={shortlisted ? "Shortlisted" : "Shortlist"}
      className={`inline-flex size-7 items-center justify-center rounded-md text-base leading-none transition-colors hover:bg-muted disabled:opacity-60 ${
        shortlisted ? "text-amber-500" : "text-muted-foreground"
      }`}
    >
      {shortlisted ? "★" : "☆"}
    </button>
  );
}
