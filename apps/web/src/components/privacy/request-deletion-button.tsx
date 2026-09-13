"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Request deletion of my data</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your data?</DialogTitle>
          <DialogDescription>
            Once an administrator approves it, your account, applications, resumes, ATS reports, interview
            recordings, code and chat are permanently deleted, and you&apos;ll be signed out. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Keep my data</DialogClose>
          <DialogClose render={<Button variant="destructive" onClick={handleConfirm} disabled={pending} />}>
            Send request
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
