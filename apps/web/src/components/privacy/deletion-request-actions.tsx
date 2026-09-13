"use client";

import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { approveDeletion, rejectDeletion } from "@/app/admin/deletion-requests/actions";

export function DeletionRequestActions({ requestId, candidateName }: { requestId: string; candidateName: string }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function handleApprove() {
    startTransition(async () => {
      const result = await approveDeletion(requestId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const summary = result.summary!;
      const problems = [
        summary.filesFailed.length > 0 && `${summary.filesFailed.length} file(s) couldn't be removed from storage`,
        !summary.identityDeleted && "the sign-in account couldn't be deleted in Clerk",
      ].filter(Boolean);
      if (problems.length > 0) {
        toast.warning(`Data deleted, but ${problems.join(" and ")}. Details are in the server log.`);
      } else {
        toast.success(`Deleted ${summary.applications} application(s) and ${summary.filesDeleted} file(s).`);
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectDeletion(requestId, reason);
      if (result.error) toast.error(result.error);
      else toast.success("Request declined. The candidate has been told why.");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger render={<Button size="sm" variant="destructive" disabled={pending} />}>Delete data</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete {candidateName}&apos;s data?</DialogTitle>
            <DialogDescription>
              Their account, applications, resumes, ATS reports, and every interview with its recording, code, chat
              and feedback are deleted, and their sign-in account is removed. The audit log keeps a record that this
              happened, without their details. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <DialogClose render={<Button variant="destructive" onClick={handleApprove} />}>Delete permanently</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>Decline</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this request?</DialogTitle>
            <DialogDescription>The candidate sees the reason you give, and can ask again.</DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. An offer under this application is still open."
            aria-label="Reason"
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <DialogClose render={<Button onClick={handleReject} disabled={reason.trim().length < 3} />}>
              Decline request
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
