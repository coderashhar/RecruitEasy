"use client";

import { useTransition } from "react";
import { toast } from "sonner";
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
import { requestMyDataDeletion } from "@/app/candidate/privacy-actions";

export function RequestDeletionButton() {
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await requestMyDataDeletion();
      if (result.error) toast.error(result.error);
      else toast.success("Request sent. An administrator will process it.");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Request deletion of my data</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogEyebrow>Request · reviewed by an administrator</AlertDialogEyebrow>
        <AlertDialogTitle>Delete your data?</AlertDialogTitle>
        <AlertDialogDescription>
          Once an administrator approves it, your account, applications, résumés, ATS reports, interview recordings,
          code and chat are permanently deleted, and you&apos;ll be signed out. This can&apos;t be undone.
        </AlertDialogDescription>
        <AlertDialogFooter note="You can keep using InterviewHub until then">
          <AlertDialogClose render={<Button variant="outline" />}>Keep my data</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" onClick={handleConfirm} disabled={pending} />}>
            Send request
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
