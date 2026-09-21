"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { Eyebrow } from "@/components/broadsheet/section";
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
import { Input } from "@/components/ui/input";
import {
  approveDeletion,
  closeDeletion,
  previewDeletion,
  rejectDeletion,
} from "@/app/admin/deletion-requests/actions";
import type { DeletionScope, DeletionSummary } from "@/lib/data-deletion";

const CONFIRM_WORD = "DELETE";
const REASON_MIN = 3;
const REASON_MAX = 1000;

function CountRow({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-hairline py-[11px] text-[13.5px] last:border-b-0 ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Reports the outcome honestly: the database transaction either committed or
 * didn't, but file and identity deletes run after it and can fail on their own.
 */
export function DeletionResult({ summary }: { summary: DeletionSummary }) {
  const failures = summary.filesFailed.length + (summary.identityDeleted ? 0 : 1);
  const totalFiles = summary.filesDeleted + summary.filesFailed.length;

  if (failures === 0) {
    return (
      <CalloutBanner tone="success" title="Deleted · nothing left behind" role="status">
        <span className="font-mono">{summary.applications}</span> applications ·{" "}
        <span className="font-mono">
          {summary.filesDeleted} of {totalFiles}
        </span>{" "}
        files removed · sign-in account removed
      </CalloutBanner>
    );
  }

  return (
    <div role="alert">
      <CalloutBanner tone="danger" title={`Database records deleted · ${failures} item${failures === 1 ? "" : "s"} did not`}>
        The transaction committed, so the applications and account rows are gone. File and identity deletes run
        afterwards and cannot roll back with it.
      </CalloutBanner>
      <div className="mt-3.5 border-t border-rule-strong">
        {summary.filesFailed.map((key) => (
          <div key={key} className="flex justify-between gap-4 border-b border-hairline py-[11px] text-[13.5px]">
            <span className="truncate font-mono text-[12.5px]">{key}</span>
            <span className="shrink-0 text-danger">storage delete failed</span>
          </div>
        ))}
        {!summary.identityDeleted && (
          <div className="flex justify-between gap-4 py-[11px] text-[13.5px]">
            <span>Clerk sign-in account</span>
            <span className="shrink-0 text-danger">not deleted</span>
          </div>
        )}
      </div>
      <p className="mt-3 font-mono text-[11.5px] text-muted-foreground">logged in the server log · remove these by hand</p>
    </div>
  );
}

export function DeletionRequestActions({
  requestId,
  candidateName,
  accountGone,
  onResult,
}: {
  requestId: string;
  candidateName: string | null;
  /** The user row is already gone, so there is nothing to delete — only a request to close. */
  accountGone?: boolean;
  onResult?: (summary: DeletionSummary) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<DeletionScope | null>(null);
  const [countedAt, setCountedAt] = useState<Date | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<DeletionSummary | null>(null);
  const name = candidateName ?? "this candidate";

  function loadScope(open: boolean) {
    if (!open) {
      setConfirmation("");
      return;
    }
    setScope(null);
    setScopeError(null);
    startTransition(async () => {
      const response = await previewDeletion(requestId);
      if (response.error) setScopeError(response.error);
      else {
        setScope(response.scope ?? null);
        setCountedAt(new Date());
      }
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const response = await approveDeletion(requestId);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      setResult(response.summary!);
      onResult?.(response.summary!);
    });
  }

  function handleReject(text: string) {
    startTransition(async () => {
      const response = await rejectDeletion(requestId, text);
      if (response.error) toast.error(response.error);
      else toast.success("Request declined. The candidate has been told why.");
    });
  }

  function handleClose() {
    startTransition(async () => {
      const response = await closeDeletion(requestId);
      if (response.error) toast.error(response.error);
      else toast.success("Request closed. There was nothing left to delete.");
    });
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <DeletionResult summary={result} />
        <div>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (accountGone) {
    return (
      <Button variant="outline" disabled={pending} onClick={handleClose}>
        Close request
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>Decline</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogEyebrow>Decline</AlertDialogEyebrow>
          <AlertDialogTitle>Tell {name} why</AlertDialogTitle>
          <AlertDialogDescription>
            Your reason is sent to them as written and stored on the request. Declining does not close the door — they
            can ask again.
          </AlertDialogDescription>
          <label className="mt-4 block">
            <span className="sr-only">Reason</span>
            <textarea
              value={reason}
              maxLength={REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="e.g. An offer under this application is still open. Please ask again once it closes."
              className="w-full resize-none border border-input bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <div className="mt-1.5 flex justify-between font-mono text-[11.5px] text-muted-foreground">
            <span>Required · at least {REASON_MIN} characters</span>
            <span className="tabular-nums">
              {reason.length} / {REASON_MAX}
            </span>
          </div>
          <AlertDialogFooter note="privacy.deletion_rejected is recorded against you">
            <AlertDialogClose render={<Button variant="outline" />}>Back</AlertDialogClose>
            <AlertDialogClose
              render={
                <Button disabled={reason.trim().length < REASON_MIN} onClick={() => handleReject(reason)} />
              }
            >
              Send and decline
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={loadScope}>
        <AlertDialogTrigger render={<Button variant="destructive" disabled={pending} />}>
          Review and delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogEyebrow>Confirm · irreversible</AlertDialogEyebrow>
          <AlertDialogTitle>Delete everything held about {name}</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone and there is no recovery copy.{" "}
            {countedAt && (
              <>
                Counted now, at{" "}
                {countedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}:
              </>
            )}
          </AlertDialogDescription>

          {scopeError ? (
            <CalloutBanner className="mt-4" tone="danger" title={scopeError} />
          ) : (
            <div className="mt-4 border-t border-rule-strong" aria-busy={!scope}>
              <CountRow label="Applications, with their résumés and ATS reports" value={scope?.applications ?? "…"} />
              <CountRow
                label="Interviews, with code, runs, chat, feedback and integrity signals"
                value={scope?.interviews ?? "…"}
              />
              <CountRow label="Stored files — résumés and recordings" value={scope?.files ?? "…"} />
              <CountRow
                label="Sign-in account, so they cannot return to a half-empty profile"
                value={scope ? (scope.hasAccount ? "yes" : "no") : "…"}
              />
              <CountRow label="Audit rows — kept, holding ids not personal details" value="kept" muted />
            </div>
          )}

          <label className="mt-[18px] block">
            <Eyebrow>Type {CONFIRM_WORD} to confirm</Eyebrow>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-[9px] h-9 w-[220px] font-mono text-sm"
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
            />
          </label>

          <AlertDialogFooter note="Two admins at once delete once">
            <AlertDialogClose render={<Button variant="outline" />}>Keep the data</AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  disabled={!scope || confirmation !== CONFIRM_WORD || pending}
                  onClick={handleApprove}
                />
              }
            >
              Delete permanently
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
