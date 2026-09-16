import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./section";

/**
 * The shared shape of every dead end — 404, thrown error, blocked action.
 *
 * Presentational and hook-free, so the same component serves a Server
 * Component's `not-found.tsx` and a Client Component's `error.tsx`.
 *
 * It animates once on mount: the page is rare (nobody sees a 404 fifty times
 * a day), so a short rise earns its place, and `motion-reduce` drops the
 * movement while keeping the fade.
 */
export function StatusPage({
  eyebrow,
  title,
  children,
  actions,
  detail,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Quiet technical line — an error digest, a route, an id. */
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-[560px] flex-col py-10 duration-200 ease-out animate-in fade-in slide-in-from-bottom-2 motion-reduce:slide-in-from-bottom-0",
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-[28px] leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-[34px]">
        {title}
      </h1>
      <div className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">{children}</div>
      {actions && <div className="mt-7 flex flex-wrap items-center gap-2.5">{actions}</div>}
      {detail && (
        <p className="mt-7 border-t border-hairline pt-3.5 font-mono text-[11.5px] break-all text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}
