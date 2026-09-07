"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  return (
    <form action={rescheduleInterviewAction} className="flex flex-col gap-4">
      <input type="hidden" name="interviewId" value={interviewId} />
      <p className="text-xs text-muted-foreground">
        Currently{" "}
        {scheduledAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
        {durationMins} min
      </p>
      <ScheduledAtField />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="durationMins">Duration (minutes)</Label>
        <Input
          id="durationMins"
          name="durationMins"
          type="number"
          min={15}
          max={240}
          step={15}
          defaultValue={durationMins}
          required
        />
      </div>
      <Button type="submit" size="sm" variant="outline">
        Reschedule
      </Button>
    </form>
  );
}
