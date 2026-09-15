import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of large, flat numbers between a strong top rule and a hairline
 * bottom rule. Columns are divided by hairlines, never boxed.
 */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid border-t border-b border-t-rule-strong border-b-border sm:grid-cols-3",
        "[&>*]:border-border max-sm:[&>*+*]:border-t sm:[&>*+*]:border-l sm:[&>*+*]:pl-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One figure, its label, and — where the figure needs qualifying — the caveat
 * beside it rather than in a note below the whole row.
 */
export function StatMeasure({
  label,
  value,
  detail,
  caveat,
  muted,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  caveat?: ReactNode;
  /** For a value that stands in for "nothing to measure yet", like an em dash. */
  muted?: boolean;
}) {
  return (
    <div className="py-5">
      <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
      <div
        className={cn(
          "mt-2.5 text-[40px] leading-none font-medium tracking-[-0.035em] tabular-nums sm:text-[46px]",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {detail && <div className="mt-2.5 text-[13px] text-muted-foreground">{detail}</div>}
      {caveat && (
        <div className="mt-3 max-w-[330px] border-t border-dashed border-border pt-2.5 text-[13px] leading-relaxed text-muted-foreground">
          {caveat}
        </div>
      )}
    </div>
  );
}

/** A 3px track with the value in mono beside it. */
export function ScoreBar({
  value,
  max = 100,
  suffix,
  width = 44,
  className,
}: {
  value: number | null;
  max?: number;
  suffix?: string;
  width?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center justify-end gap-2.5", className)}>
      <span aria-hidden="true" className="block h-[3px] bg-border" style={{ width }}>
        {value !== null && (
          <span
            className="block h-[3px] bg-foreground"
            style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
          />
        )}
      </span>
      <span className="font-mono text-[13px] tabular-nums">
        {value === null ? "—" : `${value}${suffix ?? ""}`}
      </span>
    </span>
  );
}
