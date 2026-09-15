"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { LocalTime } from "@/components/broadsheet/local-time";
import { SideEffectList } from "@/components/broadsheet/panels";
import { ActionFooter, Eyebrow } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScheduledAtField } from "@/components/schedule/scheduled-at-field";
import { rescheduleInterviewAction } from "./actions";

export function RescheduleForm({
  interviewId,
  scheduledAt,
  durationMins,
}: {
  interviewId: string;
  scheduledAt: Date;
  durationMins: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await rescheduleInterviewAction(formData);
        toast.success("Interview moved. Updated invites are on their way.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not reschedule.");
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Reschedule
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 w-full">
      <input type="hidden" name="interviewId" value={interviewId} />
      <div className="grid border-t border-b border-t-rule-strong border-b-border sm:grid-cols-2">
        <div className="py-[15px]">
          <Eyebrow>Currently</Eyebrow>
          <div className="mt-2 text-[15px] font-medium">
            <LocalTime value={scheduledAt} format="weekdayTime" />
          </div>
          <div className="mt-[3px] font-mono text-xs text-muted-foreground">{durationMins} min</div>
        </div>
        <div className="flex flex-col gap-3 py-[15px] max-sm:border-t sm:border-l sm:pl-6">
          <Eyebrow>Moving to</Eyebrow>
          <ScheduledAtField />
          <label className="flex items-center gap-3 text-[13px] text-muted-foreground">
            Duration
            <Input
              name="durationMins"
              type="number"
              min={15}
              max={240}
              step={15}
              defaultValue={durationMins}
              required
              className="h-8 w-24 font-mono"
            />
            min
          </label>
        </div>
      </div>
      <div className="mt-5">
        <Eyebrow>This will</Eyebrow>
        <SideEffectList
          className="mt-2.5"
          items={[
            "Send an updated invite to everyone, replacing the old calendar entry",
            "Reset the 24-hour and 1-hour reminders so they go out for the new time",
            "Keep the same room, code, and any feedback",
          ]}
        />
      </div>
      <ActionFooter className="mt-5" note="Only scheduled interviews can be moved · the panel is re-checked for conflicts">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Keep current time
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Moving…" : "Move interview"}
        </Button>
      </ActionFooter>
    </form>
  );
}
