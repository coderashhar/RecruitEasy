import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Server-rendered charts: each shows a single series in ink, so identity never
// depends on colour and both themes work unchanged. Every bar carries its
// value as text, and a visually hidden list repeats the data for screen readers.

export function BarList({
  items,
  max,
  format = (value) => String(value),
  label,
  labelWidth = 132,
}: {
  items: Array<{ key: string; label: ReactNode; value: number | null; note?: string }>;
  /** Scale ceiling; defaults to the largest value. */
  max?: number;
  format?: (value: number) => string;
  label: string;
  labelWidth?: number;
}) {
  const ceiling = max ?? Math.max(1, ...items.map((item) => item.value ?? 0));

  return (
    <ul aria-label={label} className="mt-3.5 flex flex-col">
      {items.map((item) => (
        <li
          key={item.key}
          className={`grid items-center gap-3.5 border-b border-hairline py-[9px] last:border-b-0 ${item.value === null ? "text-muted-foreground" : ""}`}
          style={{ gridTemplateColumns: `minmax(0,${labelWidth}px) 1fr auto` }}
        >
          <span className="truncate text-[13.5px]">{item.label}</span>
          {/* No score yet is an empty track, never a zero-length bar that reads as a real zero. */}
          <span className="block h-[9px] bg-hairline" aria-hidden="true">
            {item.value !== null && (
              <span
                className="block h-[9px] bg-foreground"
                style={{ width: `${Math.max(item.value > 0 ? 1 : 0, (item.value / ceiling) * 100)}%` }}
              />
            )}
          </span>
          <span className="min-w-[74px] text-right font-mono text-[13px] tabular-nums">
            {item.value === null ? "—" : format(item.value)}
            {item.note && <span className="ml-[7px] text-muted-foreground">{item.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const weekLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One column per week on a shared baseline, each labelled with its count. A
 * zero week keeps its baseline tick and label, so the gap is legible as a real
 * zero rather than a missing week.
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
  const dense = weeks.length > 8;

  return (
    <figure>
      <div className="mt-4 flex h-[150px] items-end gap-2 border-b border-rule-strong" role="img" aria-label={label}>
        {weeks.map(({ week, count }) => (
          <Tooltip key={week.toISOString()}>
            <TooltipTrigger
              render={<div />}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5 outline-none focus-visible:bg-muted"
              tabIndex={0}
            >
              <span
                className={`font-mono tabular-nums ${dense ? "text-[10.5px]" : "text-xs"} ${count === 0 ? "text-muted-foreground" : ""}`}
              >
                {count}
              </span>
              {count === 0 ? (
                <span className="block w-full border-t border-muted-foreground/40" />
              ) : (
                <span
                  className="block w-full bg-foreground"
                  style={{ height: `calc(${(count / ceiling) * 100}% - 1.25rem)`, minHeight: 3 }}
                />
              )}
            </TooltipTrigger>
            <TooltipContent>
              Week of {weekLabel.format(week)} · {count} {unit}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex gap-2 font-mono text-[11px] text-muted-foreground" aria-hidden="true">
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
