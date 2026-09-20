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
import {
  connectCalendar,
  disconnectCalendar,
  updateCalendarSync,
} from "@/app/settings/calendar/actions";

/**
 * A plain form, not a transition: the action ends in redirect() to Google, and
 * a client-side transition has nowhere to put a cross-origin navigation.
 */
export function ConnectCalendarButton({ label }: { label: string }) {
  return (
    <form action={connectCalendar}>
      <Button type="submit">{label}</Button>
    </form>
  );
}

export function CalendarSyncToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const formData = new FormData();
    formData.set("enabled", enabled ? "false" : "true");
    startTransition(async () => {
      await updateCalendarSync(formData);
      toast.success(enabled ? "Syncing paused." : "Syncing resumed.");
    });
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={pending}>
      {enabled ? "Pause syncing" : "Resume syncing"}
    </Button>
  );
}

export function DisconnectCalendarButton({ accountEmail }: { accountEmail: string }) {
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await disconnectCalendar();
      toast.success("Calendar disconnected.");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Disconnect</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogEyebrow>Calendar · {accountEmail}</AlertDialogEyebrow>
        <AlertDialogTitle>Disconnect this calendar?</AlertDialogTitle>
        <AlertDialogDescription>
          InterviewHub stops reading when you&apos;re busy and stops updating your calendar. Interviews already on it
          stay where they are — you&apos;ll just have to move or remove them yourself if they change.
        </AlertDialogDescription>
        <AlertDialogFooter note="You can connect it again at any time">
          <AlertDialogClose render={<Button variant="outline" />}>Keep it connected</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" onClick={handleConfirm} disabled={pending} />}>
            Disconnect
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
