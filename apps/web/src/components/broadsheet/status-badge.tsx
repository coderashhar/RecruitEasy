import type { ReactNode } from "react";
import type {
  ApplicationStatus,
  FeedbackRecommendation,
  InterviewStatus,
} from "@interviewhub/db";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "warning" | "offer" | "success" | "danger";
export type Shape = "hollow" | "half" | "dot" | "diamond" | "square" | "bar";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-(--tone-neutral-bg) text-(--tone-neutral-fg) [--glyph:var(--tone-neutral-glyph)]",
  info: "bg-(--tone-info-bg) text-(--tone-info-fg) [--glyph:var(--tone-info-glyph)]",
  warning: "bg-(--tone-warning-bg) text-(--tone-warning-fg) [--glyph:var(--tone-warning-glyph)]",
  offer: "bg-(--tone-offer-bg) text-(--tone-offer-fg) [--glyph:var(--tone-offer-glyph)]",
  success: "bg-(--tone-success-bg) text-(--tone-success-fg) [--glyph:var(--tone-success-glyph)]",
  danger: "bg-(--tone-danger-bg) text-(--tone-danger-fg) [--glyph:var(--tone-danger-glyph)]",
};

const GLYPH_TONE: Record<Tone, string> = {
  neutral: "[--glyph:var(--tone-neutral-glyph)]",
  info: "[--glyph:var(--tone-info-glyph)]",
  warning: "[--glyph:var(--tone-warning-glyph)]",
  offer: "[--glyph:var(--tone-offer-glyph)]",
  success: "[--glyph:var(--tone-success-glyph)]",
  danger: "[--glyph:var(--tone-danger-glyph)]",
};

/**
 * The shape half of "colour plus shape": every status stays distinguishable
 * in greyscale and for colour-blind reviewers. Reads its colour from --glyph,
 * so it can sit inside a chip or stand alone beside a label.
 */
export function StatusGlyph({
  shape,
  tone,
  className,
}: {
  shape: Shape;
  tone?: Tone;
  className?: string;
}) {
  const base = "inline-block shrink-0 box-border";
  const shapeClass: Record<Shape, string> = {
    hollow: "size-2 rounded-full border-[1.5px] border-(--glyph)",
    half: "size-2 rounded-full border-[1.5px] border-(--glyph) bg-[linear-gradient(90deg,var(--glyph)_50%,transparent_50%)]",
    dot: "size-2 rounded-full bg-(--glyph)",
    diamond: "size-2 rotate-45 bg-(--glyph)",
    square: "size-2 rounded-[2px] bg-(--glyph)",
    bar: "h-[3px] w-[9px] bg-(--glyph)",
  };
  return (
    <span
      aria-hidden="true"
      className={cn(base, shapeClass[shape], tone && GLYPH_TONE[tone], className)}
    />
  );
}

export function StatusBadge({
  tone,
  shape,
  children,
  size = "default",
  className,
}: {
  tone: Tone;
  shape: Shape;
  children: ReactNode;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-[7px] rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "h-5 pr-[9px] pl-[7px] text-[11.5px]" : "h-[22px] pr-2.5 pl-2 text-[12.5px]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <StatusGlyph shape={shape} />
      {children}
    </span>
  );
}

export interface StatusDisplay {
  label: string;
  tone: Tone;
  shape: Shape;
}

// Typed against the real enums so an added status is a compile error here
// rather than silently falling through to a default look.
export const APPLICATION_STATUS: Record<ApplicationStatus, StatusDisplay> = {
  APPLIED: { label: "Applied", tone: "neutral", shape: "hollow" },
  SCREENING: { label: "Screening", tone: "info", shape: "half" },
  INTERVIEWING: { label: "Interviewing", tone: "warning", shape: "dot" },
  OFFER: { label: "Offer", tone: "offer", shape: "diamond" },
  HIRED: { label: "Hired", tone: "success", shape: "square" },
  REJECTED: { label: "Rejected", tone: "danger", shape: "bar" },
};

export const INTERVIEW_STATUS: Record<InterviewStatus, StatusDisplay> = {
  SCHEDULED: { label: "Scheduled", tone: "neutral", shape: "hollow" },
  IN_PROGRESS: { label: "In progress", tone: "warning", shape: "dot" },
  COMPLETED: { label: "Completed", tone: "success", shape: "square" },
  CANCELLED: { label: "Cancelled", tone: "danger", shape: "bar" },
  NO_SHOW: { label: "No-show", tone: "warning", shape: "bar" },
};

export const RECOMMENDATION: Record<FeedbackRecommendation, StatusDisplay> = {
  STRONG_NO: { label: "Strong no", tone: "danger", shape: "bar" },
  NO: { label: "No", tone: "danger", shape: "hollow" },
  YES: { label: "Hire", tone: "offer", shape: "diamond" },
  STRONG_YES: { label: "Strong hire", tone: "success", shape: "square" },
};

/** Low to high, the order a reviewer reads a scale in. */
export const RECOMMENDATION_ORDER: FeedbackRecommendation[] = ["STRONG_NO", "NO", "YES", "STRONG_YES"];

export function ApplicationStatusBadge({
  status,
  size,
}: {
  status: ApplicationStatus;
  size?: "default" | "sm";
}) {
  const display = APPLICATION_STATUS[status];
  return (
    <StatusBadge tone={display.tone} shape={display.shape} size={size}>
      {display.label}
    </StatusBadge>
  );
}

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const display = INTERVIEW_STATUS[status];
  return (
    <StatusBadge tone={display.tone} shape={display.shape}>
      {display.label}
    </StatusBadge>
  );
}

export function RecommendationBadge({
  recommendation,
  children,
}: {
  recommendation: FeedbackRecommendation;
  children?: ReactNode;
}) {
  const display = RECOMMENDATION[recommendation];
  return (
    <StatusBadge tone={display.tone} shape={display.shape}>
      {children ?? display.label}
    </StatusBadge>
  );
}
