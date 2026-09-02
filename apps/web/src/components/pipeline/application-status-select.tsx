"use client";

import { useTransition, type ChangeEvent } from "react";
import type { ApplicationStatus } from "@interviewhub/db";
import { changeApplicationStatus } from "@/app/recruiter/applications/actions";

const selectClassName =
  "h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 disabled:opacity-60";

/**
 * Called directly (not via <form action>) so this can auto-submit on change
 * without a visible submit button inside a table cell.
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

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("status", event.target.value);
    startTransition(() => {
      void changeApplicationStatus(formData);
    });
  }

  return (
    <select
      defaultValue={status}
      onChange={handleChange}
      disabled={isPending}
      className={selectClassName}
      aria-label="Application status"
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
