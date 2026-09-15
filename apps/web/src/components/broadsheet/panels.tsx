import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusGlyph, type Shape } from "./status-badge";

/**
 * The one emphatic panel per screen. Ink on paper in light mode; in dark mode
 * `bg-foreground` resolves to paper, so the same classes invert the material
 * rather than reaching for an accent fill.
 */
export function ActNowPanel({
  eyebrow,
  title,
  detail,
  actions,
  live,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  /** A pulsing dot for something happening now or about to. */
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 bg-foreground px-5 py-4 text-background sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {live && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-rec-pulse rounded-full bg-[oklch(0.72_0.15_145)] dark:bg-[oklch(0.5_0.14_145)]"
          />
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2 font-mono text-[10px] tracking-[0.14em] text-background/70 uppercase">{eyebrow}</div>
          )}
          <div className="text-[15px] font-semibold tracking-[-0.015em] sm:text-[17px]">{title}</div>
          {detail && <div className="mt-1 text-[13px] text-background/70">{detail}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export type CalloutTone = "info" | "warning" | "success" | "danger";

const CALLOUT_CLASS: Record<CalloutTone, string> = {
  info: "bg-(--callout-info-bg) text-(--callout-info-fg) border-info [--glyph:var(--info)]",
  warning: "bg-(--callout-warning-bg) text-(--callout-warning-fg) border-warning [--glyph:var(--warning)]",
  success: "bg-(--callout-success-bg) text-(--callout-success-fg) border-success [--glyph:var(--success)]",
  danger: "bg-(--callout-danger-bg) text-(--callout-danger-fg) border-danger [--glyph:var(--danger)]",
};

const CALLOUT_SHAPE: Record<CalloutTone, Shape> = {
  info: "half",
  warning: "dot",
  success: "square",
  danger: "bar",
};

/** A 2px left rule on a tinted ground. Danger stays a banner, never a page wash. */
export function CalloutBanner({
  tone,
  title,
  children,
  action,
  pulse,
  className,
  role,
}: {
  tone: CalloutTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  pulse?: boolean;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col gap-3 border-l-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        CALLOUT_CLASS[tone],
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 text-sm font-semibold">
          <StatusGlyph shape={CALLOUT_SHAPE[tone]} className={cn(pulse && "animate-rec-pulse")} />
          {title}
        </div>
        {children && <div className="mt-1.5 text-[13.5px] leading-relaxed opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** States, before a commit, what the commit will send and change. */
export function SideEffectList({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5 text-sm leading-normal", className)}>
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden="true" className="mt-[7px] size-[7px] shrink-0 bg-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
