/**
 * Slot arithmetic for the scheduling grid. Pure and timezone-agnostic: it
 * works on instants, and the grid decides which local hours to ask about.
 */

export interface Interval {
  interviewerId: string;
  start: string;
  end: string;
}

export type SlotState =
  | { kind: "past" }
  | { kind: "free" }
  | { kind: "partial"; busy: string[] }
  | { kind: "booked" };

export function slotState(
  start: Date,
  durationMins: number,
  interviewerIds: string[],
  busy: Interval[],
  now: Date = new Date(),
): SlotState {
  if (start.getTime() < now.getTime()) return { kind: "past" };
  const end = start.getTime() + durationMins * 60_000;

  const clashing = new Set(
    busy
      .filter(
        (interval) =>
          interviewerIds.includes(interval.interviewerId) &&
          new Date(interval.start).getTime() < end &&
          new Date(interval.end).getTime() > start.getTime(),
      )
      .map((interval) => interval.interviewerId),
  );

  if (clashing.size === 0) return { kind: "free" };
  if (clashing.size >= interviewerIds.length) return { kind: "booked" };
  return { kind: "partial", busy: [...clashing] };
}

/** Local midnight of the Monday of the week containing `date`, in the runtime's timezone. */
export function localWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}
