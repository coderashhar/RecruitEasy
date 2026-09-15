"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { FeedbackRecommendation } from "@interviewhub/db";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { ActionFooter, Eyebrow } from "@/components/broadsheet/section";
import { RECOMMENDATION, RECOMMENDATION_ORDER, StatusGlyph } from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitFeedbackAction } from "./actions";

const SCORES = [1, 2, 3, 4, 5] as const;
const NOTES_MAX = 5_000;

const RUBRIC_HINT: Record<(typeof RUBRIC_CRITERIA)[number]["key"], string> = {
  coding: "Correctness, readability, testing",
  problemSolving: "Decomposition, edge cases, trade-offs",
  communication: "Narrating reasoning, taking hints",
};

/**
 * A rating per competency, evidence, and a recommendation. Submit stays
 * disabled until every rating and the recommendation are picked — a default
 * pre-selected "3" or "Yes" is how a rushed form turns into fake signal.
 */
export function FeedbackForm({
  interviewId,
  existing,
}: {
  interviewId: string;
  existing?: {
    rubricScores: Record<string, number>;
    notes: string | null;
    recommendation: FeedbackRecommendation;
  };
}) {
  const [scores, setScores] = useState<Record<string, number | undefined>>(existing?.rubricScores ?? {});
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [recommendation, setRecommendation] = useState<FeedbackRecommendation | undefined>(existing?.recommendation);
  const [pending, startTransition] = useTransition();

  const complete = RUBRIC_CRITERIA.every(({ key }) => scores[key] !== undefined) && recommendation !== undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await submitFeedbackAction(formData);
        toast.success(existing ? "Feedback updated." : "Feedback submitted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not submit feedback.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="hidden" name="interviewId" value={interviewId} />

      <div className="border-t border-rule-strong">
        {RUBRIC_CRITERIA.map(({ key, label }) => (
          <fieldset
            key={key}
            className="flex flex-col gap-3 border-b border-hairline py-[18px] sm:flex-row sm:items-center sm:justify-between sm:gap-5"
          >
            <div>
              <legend className="text-[15px] font-semibold">{label}</legend>
              <div className="mt-[3px] text-[13px] text-muted-foreground">{RUBRIC_HINT[key]}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {SCORES.map((score) => {
                const checked = scores[key] === score;
                return (
                  <label
                    key={score}
                    className={cn(
                      "flex h-[30px] w-[34px] cursor-pointer items-center justify-center font-mono text-[13px] transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                      checked
                        ? "bg-foreground font-medium text-background"
                        : "border border-input text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={key}
                      value={score}
                      checked={checked}
                      onChange={() => setScores((current) => ({ ...current, [key]: score }))}
                      className="sr-only"
                      required
                    />
                    {score}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="mt-[22px] block">
        <Eyebrow>Evidence</Eyebrow>
        <textarea
          name="notes"
          value={notes}
          maxLength={NOTES_MAX}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="What did they do? Quote the moment rather than the impression."
          className="mt-[9px] w-full resize-y border border-input bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      <div className="mt-[7px] flex justify-between font-mono text-[11.5px] text-muted-foreground">
        <span>Cite what you saw, not impressions</span>
        <span className="tabular-nums">
          {notes.length} / {NOTES_MAX}
        </span>
      </div>

      <fieldset className="mt-[22px]">
        <legend>
          <Eyebrow>Recommendation</Eyebrow>
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {RECOMMENDATION_ORDER.map((value) => {
            const display = RECOMMENDATION[value];
            const checked = recommendation === value;
            return (
              <label
                key={value}
                className={cn(
                  "inline-flex h-[34px] cursor-pointer items-center gap-2 px-3.5 text-[13.5px] has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  checked
                    ? "border-[1.5px] border-foreground font-semibold"
                    : "border border-input text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="recommendation"
                  value={value}
                  checked={checked}
                  onChange={() => setRecommendation(value)}
                  className="sr-only"
                  required
                />
                {checked && <StatusGlyph shape={display.shape} tone={display.tone} />}
                {display.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <ActionFooter
        className="mt-6"
        note={complete ? "One entry per interviewer · resubmitting updates yours" : "Rate all three and pick a recommendation"}
      >
        <Button type="submit" disabled={!complete || pending}>
          {pending ? "Saving…" : existing ? "Update feedback" : "Submit feedback"}
        </Button>
      </ActionFooter>
    </form>
  );
}
