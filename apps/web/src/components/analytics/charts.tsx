import type { ReactNode } from "react";

// Server-rendered charts: each shows a single series, in the theme's primary
// ink, so identity never depends on colour and both themes work unchanged.
// Every bar carries its value as text, and a visually hidden list repeats the
// data for screen readers.

export function BarList({
  items,
  max,
  format = (value) => String(value),
  label,
}: {
  items: Array<{ key: string; label: ReactNode; value: number | null; note?: string }>;
  /** Scale ceiling; defaults to the largest value. */
  max?: number;
  format?: (value: number) => string;
  label: string;
}) {
  const ceiling = max ?? Math.max(1, ...items.map((item) => item.value ?? 0));

  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${item.value === null ? 0 : Math.max(item.value > 0 ? 2 : 0, (item.value / ceiling) * 100)}%` }}
            />
          </span>
          <span className="min-w-12 text-right tabular-nums">
            {item.value === null ? "—" : format(item.value)}
            {item.note && <span className="ml-1 text-xs text-muted-foreground">{item.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const weekLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One column per week on a shared zero baseline. Week-of labels on the first,
 * last and every other column in between, so a 13-week range doesn't crowd;
 * every column still names its week and count on hover and to screen readers.
 */
export function WeeklyColumns({
  weeks,
  label,
  unit,
}: {
  weeks: Array<{ week: Date; count: number }>;
  label: string;
  unit: string;
}) {
  const ceiling = Math.max(1, ...weeks.map((week) => week.count));
  const labelEvery = weeks.length > 8 ? 2 : 1;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Peak {ceiling === 1 && weeks.every((week) => week.count === 0) ? 0 : ceiling}</span>
        <span>per week, UTC</span>
      </div>
      <div className="flex h-32 items-end gap-1 border-b" role="img" aria-label={label}>
        {weeks.map(({ week, count }) => (
          <div
            key={week.toISOString()}
            className="group relative flex h-full flex-1 items-end"
            title={`Week of ${weekLabel.format(week)}: ${count} ${unit}`}
          >
            <div
              className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-70"
              style={{ height: count === 0 ? 0 : `${Math.max(3, (count / ceiling) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-popover px-1.5 text-xs tabular-nums text-popover-foreground shadow group-hover:block">
              {count}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-1 text-[11px] text-muted-foreground" aria-hidden="true">
        {weeks.map(({ week }, index) => (
          <span key={week.toISOString()} className="flex-1 truncate text-center">
            {index % labelEvery === 0 || index === weeks.length - 1 ? weekLabel.format(week) : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {weeks.map(({ week, count }) => `Week of ${weekLabel.format(week)}: ${count} ${unit}`).join(". ")}
      </figcaption>
    </figure>
  );
}
