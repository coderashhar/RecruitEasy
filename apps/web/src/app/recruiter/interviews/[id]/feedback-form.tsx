import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitFeedbackAction } from "./actions";

// Native <select>/<textarea> for the same reason as the other forms in this
// app: uncontrolled submission through a Server Action (FormData), which the
// shadcn Select primitive doesn't wire a `name` into.
const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const textareaClassName =
  "min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const RECOMMENDATIONS = [
  { value: "STRONG_YES", label: "Strong yes" },
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "STRONG_NO", label: "Strong no" },
] as const;

const SCORES = [1, 2, 3, 4, 5] as const;

export function FeedbackForm({
  interviewId,
  existing,
}: {
  interviewId: string;
  existing?: {
    rubricScores: Record<string, number>;
    notes: string | null;
    recommendation: string;
  };
}) {
  return (
    <form action={submitFeedbackAction} className="flex flex-col gap-4">
      <input type="hidden" name="interviewId" value={interviewId} />

      <div className="grid gap-3 sm:grid-cols-3">
        {RUBRIC_CRITERIA.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={key}>{label}</Label>
            <select
              id={key}
              name={key}
              required
              defaultValue={existing?.rubricScores?.[key] ?? 3}
              className={selectClassName}
            >
              {SCORES.map((score) => (
                <option key={score} value={score}>
                  {score}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="recommendation">Recommendation</Label>
        <select
          id="recommendation"
          name="recommendation"
          required
          defaultValue={existing?.recommendation ?? "YES"}
          className={selectClassName}
        >
          {RECOMMENDATIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          maxLength={5_000}
          defaultValue={existing?.notes ?? ""}
          className={textareaClassName}
        />
      </div>

      <Button type="submit" size="sm">
        {existing ? "Update feedback" : "Submit feedback"}
      </Button>
    </form>
  );
}
