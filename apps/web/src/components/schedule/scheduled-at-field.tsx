"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A `datetime-local` input's value ("2026-10-01T14:30") carries no timezone —
 * per spec, parsing that string with `new Date()` treats it as local to
 * *whatever runs the parse*. In the browser that's correctly the recruiter's
 * own timezone, but this form submits to a Server Action, and parsing the
 * same raw string again on the server would instead use the server process's
 * timezone (UTC on Vercel) — silently scheduling the wrong instant whenever
 * those two timezones differ, which in production is the common case, not
 * the exception.
 *
 * The fix has to happen here, client-side, while the browser's own timezone
 * is still available: convert to a real ISO instant (with a "Z" offset)
 * before it ever reaches the server, so scheduleInterviewSchema's
 * `z.coerce.date()` has nothing left to guess about.
 */
/** Pulled out so the conversion itself is testable without rendering React. */
export function localDateTimeToIso(value: string): string {
  return value ? new Date(value).toISOString() : "";
}

export function ScheduledAtField() {
  const localInputId = useId();
  const [isoValue, setIsoValue] = useState("");

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setIsoValue(localDateTimeToIso(event.target.value));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={localInputId}>Date &amp; time</Label>
      <Input id={localInputId} type="datetime-local" required onChange={handleChange} />
      <input type="hidden" name="scheduledAt" value={isoValue} />
    </div>
  );
}
