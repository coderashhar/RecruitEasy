"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { ApplicationStatus } from "@interviewhub/db";
import { changeApplicationStatus } from "@/app/recruiter/applications/actions";
import { APPLICATION_STATUS } from "@/components/broadsheet/status-badge";

const selectClassName =
  "h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 disabled:opacity-60";

/**
 * Called directly (not via <form action>) so this can auto-submit on change
 * without a visible submit button inside a table cell.
 *
 * Controlled rather than uncontrolled: an uncontrolled <select> keeps
 * displaying whatever was picked even when the server rejected the write,
 * leaving the table showing a status the database does not have. Holding the
 * value in state lets a failure roll it back to what was actually persisted.
 */
export function ApplicationStatusSelect({
  applicationId,
  status,
  statuses,
}: {
  applicationId: string;
  status: ApplicationStatus;
  statuses: readonly ApplicationStatus[];
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<ApplicationStatus>(status);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ApplicationStatus;
    const previous = value;
    setValue(next);

    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("status", next);

    startTransition(async () => {
      try {
        await changeApplicationStatus(formData);
      } catch (err) {
        setValue(previous);
        toast.error(err instanceof Error ? err.message : "Could not update the application.");
      }
    });
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={isPending}
      className={selectClassName}
      aria-label="Application status"
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {APPLICATION_STATUS[s].label}
        </option>
      ))}
    </select>
  );
}
