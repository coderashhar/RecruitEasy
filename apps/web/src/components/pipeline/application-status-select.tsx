"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { ApplicationStatus } from "@interviewhub/db";
import { changeApplicationStatus } from "@/app/recruiter/applications/actions";
import { APPLICATION_STATUS } from "@/components/broadsheet/status-badge";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogEyebrow,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { classifyStatusChange } from "@/lib/application-status";

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
 *
 * Moving out of HIRED or REJECTED stops to ask first (handoff KI-12): the
 * candidate has already been told that decision, and saving emails them the
 * new status straight away.
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
  // The overturn waiting on the dialog, if any.
  const [pendingOverturn, setPendingOverturn] = useState<ApplicationStatus | null>(null);

  function save(next: ApplicationStatus, confirmOverturn: boolean) {
    const previous = value;
    setValue(next);

    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("status", next);
    if (confirmOverturn) formData.set("confirmOverturn", "true");

    startTransition(async () => {
      try {
        await changeApplicationStatus(formData);
      } catch (err) {
        setValue(previous);
        toast.error(err instanceof Error ? err.message : "Could not update the application.");
      }
    });
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as ApplicationStatus;
    if (classifyStatusChange(value, next) === "overturn") {
      // The select stays on the current value until the dialog is answered.
      setPendingOverturn(next);
      return;
    }
    save(next, false);
  }

  const decided = APPLICATION_STATUS[value].label.toLowerCase();

  return (
    <>
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

      <AlertDialog open={pendingOverturn !== null} onOpenChange={(open) => !open && setPendingOverturn(null)}>
        <AlertDialogContent>
          <AlertDialogEyebrow>Change a decision</AlertDialogEyebrow>
          <AlertDialogTitle>
            Move from {APPLICATION_STATUS[value].label} to{" "}
            {pendingOverturn ? APPLICATION_STATUS[pendingOverturn].label : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This candidate has already been told they were {decided}. Saving emails them the new status straight away,
            and the change is recorded in the audit log as an overturned decision.
          </AlertDialogDescription>
          <AlertDialogFooter note="Nothing is sent until you confirm">
            <AlertDialogClose render={<Button variant="outline" />}>Keep it {decided}</AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  onClick={() => {
                    if (pendingOverturn) save(pendingOverturn, true);
                    setPendingOverturn(null);
                  }}
                />
              }
            >
              Change and notify
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
