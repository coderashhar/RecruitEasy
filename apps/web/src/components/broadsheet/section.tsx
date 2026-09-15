import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Mono, 10px, tracked uppercase — the label style every section opens with. */
export function Eyebrow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase", className)}
      {...props}
    />
  );
}

/**
 * Opens a section: its label over a strong rule. Rows inside the section are
 * separated by hairlines, so the two rule weights carry the hierarchy that
 * cards and shadows would elsewhere.
 */
export function SectionLabel({
  children,
  aside,
  className,
  id,
}: {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 border-b border-rule-strong pb-[9px]",
        className,
      )}
    >
      <h2 id={id} className="font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase">
        {children}
      </h2>
      {aside && <span className="text-right font-mono text-[11.5px] text-muted-foreground">{aside}</span>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 text-[14.5px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** A label–value row, the unit most detail sections are built from. */
export function FactRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-5 border-b border-hairline py-3.5 text-sm last:border-b-0",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/** The closing rule of a form or dialog: a quiet note on the left, actions on the right. */
export function ActionFooter({
  note,
  children,
  className,
}: {
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-3 border-t border-rule-strong pt-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <span className="font-mono text-[11.5px] text-muted-foreground">{note}</span>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("py-4 text-sm text-muted-foreground", className)}>{children}</p>;
}
