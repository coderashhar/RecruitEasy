"use client";

import { useSyncExternalStore } from "react";

const FORMATS = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  weekdayTime: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  dayMonth: { day: "numeric", month: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type LocalTimeFormat = keyof typeof FORMATS;

const subscribe = () => () => {};

/**
 * A date rendered in the viewer's own timezone.
 *
 * The server can only format in its own zone — UTC on Vercel — which is the
 * same trap scheduled-at-field.tsx documents for parsing. So the server
 * snapshot renders a UTC value labelled as such, and hydration swaps in the
 * viewer's local time; nobody ever sees an unlabelled wrong hour.
 */
export function LocalTime({
  value,
  format = "datetime",
  className,
}: {
  value: Date | string;
  format?: LocalTimeFormat;
  className?: string;
}) {
  const date = typeof value === "string" ? new Date(value) : value;
  const iso = date.toISOString();

  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(undefined, FORMATS[format]).format(date),
    () => `${new Intl.DateTimeFormat("en-GB", { ...FORMATS[format], timeZone: "UTC" }).format(date)}${format === "date" || format === "dayMonth" ? "" : " UTC"}`,
  );

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
