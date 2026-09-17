"use client";

import { useMemo, useState, useTransition } from "react";
import { CalloutBanner, SideEffectList } from "@/components/broadsheet/panels";
import { ActionFooter, Eyebrow, FactRow, SectionLabel } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { loadPanelBusy, scheduleInterview } from "@/app/recruiter/schedule/actions";
import { localWeekStart, slotState, type Interval, type SlotState } from "@/lib/availability";
import { cn } from "@/lib/utils";
import { localDateTimeToIso } from "./scheduled-at-field";

export interface SchedulableApplication {
  id: string;
  candidateName: string;
  jobTitle: string;
}

export interface SchedulableInterviewer {
  id: string;
  name: string;
  role: string;
}

const DURATION_PRESETS = [30, 45, 60, 90, 120];
const DURATION_OPTIONS = Array.from({ length: 16 }, (_, index) => (index + 1) * 15);
const DAY_COUNT = 5;
const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, index) => FIRST_HOUR + index);

const STEPS = ["Who and how long", "Pick a time", "Review and send"] as const;

const time = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const utcTime = (date: Date) =>
  date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const longDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const shortDay = (date: Date) => date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

function timezoneLabel() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = new Intl.DateTimeFormat("en-US", { timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  return offset ? `${zone} · ${offset}` : zone;
}

function StepRail({ step }: { step: number }) {
  return (
    <ol className="mt-[26px] grid border-t border-b border-t-rule-strong border-b-border sm:grid-cols-3">
      {STEPS.map((label, index) => {
        const current = index === step;
        const done = index < step;
        return (
          <li
            key={label}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 py-3.5",
              index > 0 && "max-sm:border-t sm:border-l sm:pl-6",
            )}
          >
            <span
              className={cn(
                "flex size-[22px] items-center justify-center font-mono text-xs",
                current || done ? "bg-foreground text-background" : "border border-input text-muted-foreground",
              )}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={cn("text-sm", current ? "font-semibold" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const cellClass: Record<SlotState["kind"] | "selected", string> = {
  past: "cursor-not-allowed bg-muted/40 text-muted-foreground/50",
  free: "hover:bg-muted",
  partial:
    "bg-[repeating-linear-gradient(135deg,var(--border)_0_3px,transparent_3px_6px)] hover:bg-[repeating-linear-gradient(135deg,var(--input)_0_3px,transparent_3px_6px)]",
  booked: "cursor-not-allowed bg-border",
  selected: "bg-foreground text-background",
};

export function ScheduleFlow({
  applications,
  interviewers,
  prefillApplicationId,
  round,
}: {
  applications: SchedulableApplication[];
  interviewers: SchedulableInterviewer[];
  prefillApplicationId?: string;
  round: number;
}) {
  const [step, setStep] = useState(0);
  const [applicationId, setApplicationId] = useState(
    applications.some((application) => application.id === prefillApplicationId)
      ? prefillApplicationId!
      : (applications[0]?.id ?? ""),
  );
  const [duration, setDuration] = useState(60);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState(() => localWeekStart(new Date()));
  const [busy, setBusy] = useState<Interval[]>([]);
  const [selected, setSelected] = useState<Date | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [loadingBusy, startBusyTransition] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const application = applications.find((entry) => entry.id === applicationId);
  const panel = interviewers.filter((interviewer) => panelIds.includes(interviewer.id));
  const panelNames = panel.map((interviewer) => interviewer.name);

  const days = useMemo(
    () =>
      Array.from({ length: DAY_COUNT }, (_, index) => {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + index);
        return day;
      }),
    [weekStart],
  );

  function refreshBusy(start: Date) {
    startBusyTransition(async () => {
      setBusy(await loadPanelBusy(panelIds, start.toISOString()));
    });
  }

  function goToGrid() {
    setError(null);
    setStep(1);
    refreshBusy(weekStart);
  }

  function shiftWeek(weeks: number) {
    const next = weeks === 0 ? localWeekStart(new Date()) : new Date(weekStart);
    if (weeks !== 0) next.setDate(next.getDate() + weeks * 7);
    setWeekStart(next);
    refreshBusy(next);
  }

  function togglePanel(id: string, checked: boolean) {
    setPanelIds((ids) => (checked ? [...ids, id] : ids.filter((existing) => existing !== id)));
    setSelected(null);
  }

  function confirm() {
    if (!selected || !application) return;
    const formData = new FormData();
    formData.set("applicationId", application.id);
    formData.set("scheduledAt", selected.toISOString());
    formData.set("durationMins", String(duration));
    formData.set("round", String(round));
    for (const id of panelIds) formData.append("interviewerIds", id);

    setError(null);
    startSubmit(async () => {
      const result = await scheduleInterview(formData);
      if (result?.error) setError({ message: result.error, conflict: Boolean(result.conflict) });
    });
  }

  const selectedEnd = selected ? new Date(selected.getTime() + duration * 60_000) : null;
  const weekLabel = weekStart.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const now = new Date();

  return (
    <div className="flex flex-col">
      <StepRail step={step} />

      {step === 0 && (
        <>
          <div className="mt-[30px] grid items-start gap-14 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <label className="block">
                <Eyebrow>Application</Eyebrow>
                <select
                  value={applicationId}
                  onChange={(event) => setApplicationId(event.target.value)}
                  className="mt-[9px] h-[38px] w-full border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {applications.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.candidateName} — {entry.jobTitle}
                    </option>
                  ))}
                </select>
              </label>
              {round > 1 && <p className="mt-[7px] text-[13px] text-muted-foreground">Scheduling round {round}</p>}

              <fieldset className="mt-[26px]">
                <legend>
                  <Eyebrow>Duration</Eyebrow>
                </legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={duration === minutes}
                      onClick={() => {
                        setDuration(minutes);
                        setSelected(null);
                      }}
                      className={cn(
                        "inline-flex h-[34px] items-center px-[15px] font-mono text-[13px]",
                        duration === minutes
                          ? "bg-foreground font-medium text-background"
                          : "border border-input text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {minutes}
                    </button>
                  ))}
                  <select
                    aria-label="Custom duration"
                    value={DURATION_PRESETS.includes(duration) ? "" : duration}
                    onChange={(event) => {
                      if (event.target.value) setDuration(Number(event.target.value));
                      setSelected(null);
                    }}
                    className={cn(
                      "h-[34px] border border-dashed border-input bg-transparent px-2.5 text-[13px] outline-none",
                      !DURATION_PRESETS.includes(duration) && "border-solid border-foreground font-medium",
                    )}
                  >
                    <option value="">Custom</option>
                    {DURATION_OPTIONS.filter((minutes) => !DURATION_PRESETS.includes(minutes)).map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-[7px] font-mono text-[11.5px] text-muted-foreground">minutes · 15 to 240, in 15s</div>
              </fieldset>

              <fieldset className="mt-[26px]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <legend>
                    <Eyebrow>Interviewers · {panelIds.length} selected</Eyebrow>
                  </legend>
                  <span className="text-[13px] text-muted-foreground">Availability is read from these people only</span>
                </div>
                {interviewers.length === 0 ? (
                  <p className="mt-2 border-t py-3 text-sm text-muted-foreground">No interviewers in this organisation yet.</p>
                ) : (
                  <div className="mt-[9px] border-t">
                    {interviewers.map((interviewer) => {
                      const checked = panelIds.includes(interviewer.id);
                      return (
                        <label
                          key={interviewer.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-hairline py-3 last:border-b-0"
                        >
                          <Checkbox checked={checked} onCheckedChange={(next) => togglePanel(interviewer.id, next)} />
                          <span className={cn("flex-1 text-sm", checked ? "font-medium" : "text-foreground/80")}>
                            {interviewer.name}
                          </span>
                          <span className="text-[13px] text-muted-foreground capitalize">
                            {interviewer.role.toLowerCase()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </div>

            <aside>
              <SectionLabel>Times</SectionLabel>
              <FactRow label="Your timezone">
                <span className="font-mono text-[13px]" suppressHydrationWarning>
                  {timezoneLabel()}
                </span>
              </FactRow>
              <FactRow label="Stored as">
                <span className="font-mono text-[13px]">a UTC instant</span>
              </FactRow>
              <p className="mt-3.5 text-[13px] leading-relaxed text-muted-foreground">
                The grid in step 2 shows your clock beside UTC, so nobody does the arithmetic. The candidate&apos;s
                calendar invite converts the time into their own timezone.
              </p>
            </aside>
          </div>

          <ActionFooter className="mt-8" note="Nothing is sent until step 3">
            <Button size="lg" disabled={!application || panelIds.length === 0} onClick={goToGrid}>
              Find a time
            </Button>
          </ActionFooter>
        </>
      )}

      {step === 1 && (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Pick a time</h2>
              <p className="mt-[7px] text-sm text-muted-foreground">
                {duration} minutes with {panelNames.join(" and ")} · week of {weekLabel}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => shiftWeek(-1)}>
                ‹
              </Button>
              <Button variant="outline" onClick={() => shiftWeek(0)}>
                This week
              </Button>
              <Button variant="outline" size="icon" aria-label="Next week" onClick={() => shiftWeek(1)}>
                ›
              </Button>
            </div>
          </div>

          <div className="mt-[22px] flex flex-wrap items-center gap-x-[26px] gap-y-2 border-b border-rule-strong pb-3.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-[9px]">
              <span className="size-[15px] border border-border" />
              All free
            </span>
            <span className="inline-flex items-center gap-[9px]">
              <span className={cn("size-[15px] border border-border", cellClass.partial)} />
              Some booked
            </span>
            <span className="inline-flex items-center gap-[9px]">
              <span className="size-[15px] bg-border" />
              All booked
            </span>
            <span className="inline-flex items-center gap-[9px]">
              <span className="size-[15px] bg-foreground" />
              Selected
            </span>
            <span className="font-mono text-[11.5px] sm:ml-auto" aria-live="polite">
              {loadingBusy ? "reading calendars…" : "conflicts checked before you choose"}
            </span>
          </div>

          <div className="mt-[18px] overflow-x-auto">
            <div
              role="grid"
              aria-label={`Start times, week of ${weekLabel}`}
              aria-busy={loadingBusy}
              className={cn(
                "grid min-w-[640px] grid-cols-[96px_repeat(5,minmax(0,1fr))] transition-opacity",
                loadingBusy && "opacity-50",
              )}
            >
              <div className="border-b" role="presentation" />
              {days.map((day) => {
                const dayEnd = new Date(day);
                dayEnd.setDate(dayEnd.getDate() + 1);
                const booked = busy.filter(
                  (interval) => new Date(interval.start) >= day && new Date(interval.start) < dayEnd,
                ).length;
                return (
                  <div key={day.toISOString()} role="columnheader" className="border-b border-l border-l-hairline pb-[9px] pl-2.5">
                    <div className="text-[13.5px] font-semibold">{shortDay(day)}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {booked === 0 ? "free" : `${booked} booked`}
                    </div>
                  </div>
                );
              })}

              {HOURS.map((hour) => {
                const labelDate = new Date(days[0]);
                labelDate.setHours(hour, 0, 0, 0);
                return (
                  <div key={hour} role="row" className="contents">
                    <div role="rowheader" className="border-b border-hairline pt-[9px] pr-3 text-right">
                      <div className="font-mono text-xs">{time(labelDate)}</div>
                      <div className="mt-px font-mono text-[10.5px] text-muted-foreground">{utcTime(labelDate)} UTC</div>
                    </div>
                    {days.map((day) => {
                      const start = new Date(day);
                      start.setHours(hour, 0, 0, 0);
                      const state = slotState(start, duration, panelIds, busy, now);
                      const isSelected = selected?.getTime() === start.getTime();
                      const disabled = state.kind === "past" || state.kind === "booked";
                      const busyNames =
                        state.kind === "partial"
                          ? interviewers.filter((interviewer) => state.busy.includes(interviewer.id)).map((i) => i.name.split(" ")[0])
                          : [];
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          role="gridcell"
                          disabled={disabled || loadingBusy}
                          aria-selected={isSelected}
                          aria-label={`${longDate(start)} ${time(start)}, ${
                            state.kind === "free" ? "everyone free" : state.kind === "partial" ? `${busyNames.join(" and ")} booked` : state.kind === "booked" ? "everyone booked" : "in the past"
                          }`}
                          onClick={() => setSelected(start)}
                          className={cn(
                            "flex h-[52px] min-w-0 flex-col justify-center border-b border-l border-b-hairline border-l-hairline px-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                            isSelected ? cellClass.selected : cellClass[state.kind],
                          )}
                        >
                          {isSelected && selectedEnd ? (
                            <>
                              <span className="text-[13px] font-semibold">
                                {time(start)}–{time(selectedEnd)}
                              </span>
                              <span className="mt-0.5 font-mono text-[10.5px] opacity-80">{utcTime(start)} UTC</span>
                            </>
                          ) : (
                            state.kind === "partial" && (
                              <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                                {busyNames.join(", ")} booked
                              </span>
                            )
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <label className="mt-5 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
            Outside these hours? Enter an exact time
            <input
              type="datetime-local"
              onChange={(event) => {
                const iso = localDateTimeToIso(event.target.value);
                setSelected(iso ? new Date(iso) : null);
              }}
              className="h-8 border border-input bg-transparent px-2.5 font-mono text-[13px] text-foreground outline-none focus-visible:border-ring"
            />
            <span className="font-mono text-[11.5px]">re-checked for conflicts on confirm</span>
          </label>

          <ActionFooter
            className="mt-[18px]"
            note={
              selected && selectedEnd ? (
                <span className="font-sans text-sm text-foreground">
                  <span className="font-semibold">
                    {longDate(selected)}, {time(selected)}–{time(selectedEnd)}
                  </span>
                  <span className="text-muted-foreground"> · {utcTime(selected)} UTC</span>
                </span>
              ) : (
                "Pick a start time"
              )
            }
          >
            <Button variant="outline" size="lg" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button size="lg" disabled={!selected} onClick={() => setStep(2)}>
              Review
            </Button>
          </ActionFooter>
        </>
      )}

      {step === 2 && selected && selectedEnd && application && (
        <>
          <div className="mt-6">
            <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Review and send</h2>
            <p className="mt-[7px] text-sm text-muted-foreground">
              {panel.length + 1} people get an email and a calendar invite when you confirm
            </p>
          </div>

          {error && (
            <CalloutBanner
              className="mt-5"
              tone="danger"
              role="alert"
              title={error.conflict ? "Someone on the panel was booked into this slot while you were choosing" : error.message}
              action={
                error.conflict && (
                  <Button variant="outline" onClick={goToGrid}>
                    Back to the grid
                  </Button>
                )
              }
            >
              Nothing was sent.
            </CalloutBanner>
          )}

          <div className="mt-[26px] grid items-start gap-14 lg:grid-cols-2">
            <section aria-labelledby="the-interview">
              <SectionLabel id="the-interview">The interview</SectionLabel>
              <FactRow label="Candidate">
                <span className="font-medium">{application.candidateName}</span>
              </FactRow>
              <FactRow label="Job and round">
                <span className="font-medium">
                  {application.jobTitle} · round {round}
                </span>
              </FactRow>
              <FactRow label="When">
                <span className="font-medium">
                  {selected.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })},{" "}
                  {time(selected)}
                </span>
                <br />
                <span className="font-mono text-xs text-muted-foreground">{utcTime(selected)} UTC</span>
              </FactRow>
              <FactRow label="Duration">
                <span className="font-mono font-medium">{duration} min</span>
              </FactRow>
              <FactRow label="Panel">
                <span className="font-medium">{panelNames.join(", ")}</span>
              </FactRow>
              <button type="button" onClick={() => setStep(0)} className="mt-3 text-[13.5px] text-primary hover:underline">
                Edit any of this
              </button>
            </section>

            <section aria-labelledby="what-gets-sent">
              <SectionLabel id="what-gets-sent">What gets sent</SectionLabel>
              <SideEffectList
                className="mt-4"
                items={[
                  <>
                    <span className="font-medium">{application.candidateName}</span> — an invite with the join link and
                    a calendar file
                  </>,
                  <>
                    <span className="font-medium">{panelNames.join(", ")}</span> — the same invite, with the room link
                  </>,
                  "Reminders 24 hours and 1 hour before, to everyone",
                  <>
                    <span className="font-mono text-[12.5px]">interview.scheduled</span> recorded in the audit log
                    against your account
                  </>,
                ]}
              />
            </section>
          </div>

          <ActionFooter className="mt-8" note="Slot re-checked for conflicts on confirm">
            <Button variant="outline" size="lg" disabled={submitting} onClick={() => setStep(1)}>
              Back
            </Button>
            <Button size="lg" disabled={submitting} onClick={confirm}>
              {submitting ? "Sending…" : "Confirm and send invites"}
            </Button>
          </ActionFooter>
        </>
      )}
    </div>
  );
}
