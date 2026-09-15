"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { RecordingRoomState } from "@interviewhub/types";
import { StatusGlyph, type Shape, type Tone } from "@/components/broadsheet/status-badge";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "./socket-yjs-provider";

const CONNECTION: Record<ConnectionStatus, { label: string; tone: Tone; shape: Shape; pulse?: boolean }> = {
  connecting: { label: "Connecting", tone: "warning", shape: "dot", pulse: true },
  connected: { label: "Connected", tone: "success", shape: "square" },
  reconnecting: { label: "Reconnecting", tone: "warning", shape: "dot", pulse: true },
  disconnected: { label: "Disconnected", tone: "danger", shape: "bar" },
  unauthorized: { label: "Session expired", tone: "danger", shape: "bar" },
};

function formatClock(totalSeconds: number) {
  const seconds = Math.abs(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Counts down to the end of the slot, then up as overtime. Starts empty and
 * fills in after mount: the server has no business rendering "now".
 */
function TimeLeft({ scheduledAt, durationMins }: { scheduledAt: Date; durationMins: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    const first = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);

  if (now === null) return <span className="w-[86px]" />;

  const start = scheduledAt.getTime();
  const end = start + durationMins * 60_000;
  const text =
    now < start
      ? `starts in ${formatClock(Math.round((start - now) / 1000))}`
      : now <= end
        ? `${formatClock(Math.round((end - now) / 1000))} left`
        : `${formatClock(Math.round((now - end) / 1000))} over`;

  return (
    <span className={cn("font-mono text-[13px] tabular-nums", now > end ? "text-warning" : "text-foreground/90")}>
      {text}
    </span>
  );
}

export function RoomHeader({
  title,
  subtitle,
  leaveHref,
  connection,
  recordingState,
  scheduledAt,
  durationMins,
}: {
  title: string;
  subtitle: ReactNode;
  leaveHref: string;
  connection: ConnectionStatus;
  recordingState: RecordingRoomState;
  scheduledAt: Date;
  durationMins: number;
}) {
  const status = CONNECTION[connection];

  return (
    <header className="flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b px-5 py-2">
      <div className="flex min-w-0 items-center gap-[18px]">
        <Link
          href={leaveHref}
          className="inline-flex h-[30px] shrink-0 items-center gap-2 border border-input px-[13px] text-[13px] font-medium text-foreground/90 hover:bg-muted"
        >
          <span aria-hidden="true" className="size-[9px] rounded-full border-[1.5px] border-muted-foreground" />
          Leave
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-[-0.01em]">{title}</h1>
          <p className="truncate text-[12.5px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-5" aria-live="polite">
        {recordingState === "recording" && (
          <span className="inline-flex items-center gap-2 text-[13px] text-(--tone-danger-fg)">
            <StatusGlyph shape="dot" tone="danger" className="animate-rec-pulse" />
            Recording
          </span>
        )}
        {recordingState === "processing" && (
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <StatusGlyph shape="hollow" tone="neutral" />
            Saving recording
          </span>
        )}
        <span className="inline-flex items-center gap-2 text-[13px] text-foreground/80">
          <StatusGlyph shape={status.shape} tone={status.tone} className={cn(status.pulse && "animate-rec-pulse")} />
          {status.label}
        </span>
        <TimeLeft scheduledAt={scheduledAt} durationMins={durationMins} />
      </div>
    </header>
  );
}

/** The floating control row — the single shadow in the whole product. */
export function RoomDock({ children }: { children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Room controls"
      className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto border border-input bg-[oklch(0.22_0.004_85/0.96)] p-[7px] shadow-[0_18px_40px_oklch(0.1_0_0/0.5)]"
    >
      {children}
    </div>
  );
}

export function DockButton({
  children,
  onClick,
  pressed,
  disabled,
  tone = "default",
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center gap-2 px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        tone === "danger"
          ? "bg-danger font-semibold text-danger-foreground hover:bg-danger/85"
          : pressed
            ? "bg-foreground/10 text-foreground"
            : "text-foreground/85 hover:bg-foreground/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function DockDivider() {
  return <span aria-hidden="true" className="mx-[5px] h-[22px] w-px shrink-0 bg-input" />;
}
