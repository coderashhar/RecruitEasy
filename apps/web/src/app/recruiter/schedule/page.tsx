import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScheduledAtField } from "@/components/schedule/scheduled-at-field";
import { getPotentialInterviewers, getSchedulableApplications } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { scheduleInterview } from "./actions";

// Native <select>/checkboxes rather than the shadcn Select primitive: this form
// is submitted uncontrolled via a Server Action (FormData), and the Select
// component here is controlled-only with no `name` prop wired to native form
// submission. Styled to match Input so it doesn't look out of place.
const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string; round?: string }>;
}) {
  const { applicationId: prefillAppId, round: roundStr } = await searchParams;
  const prefillRound = roundStr ? parseInt(roundStr, 10) : 1;

  const { user } = await requireCurrentUser(["RECRUITER", "ADMIN"]);
  const [applications, interviewers] = await Promise.all([
    getSchedulableApplications(user.orgId),
    getPotentialInterviewers(user.orgId),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Schedule an interview</CardTitle>
          <CardDescription>Pick an application, a time, and who&apos;s interviewing.</CardDescription>
        </CardHeader>
        <form action={scheduleInterview} className="flex flex-col gap-5 px-6 pb-6">
          <input type="hidden" name="round" value={prefillRound} />
          {prefillRound > 1 && (
            <p className="text-sm font-medium text-muted-foreground">
              Scheduling round {prefillRound}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="applicationId">Application</Label>
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No applications to schedule yet.</p>
            ) : (
              <select
                id="applicationId"
                name="applicationId"
                required
                defaultValue={prefillAppId}
                className={selectClassName}
              >
                {applications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.candidate.name} — {application.job.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <ScheduledAtField />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="durationMins">Duration (minutes)</Label>
            <Input
              id="durationMins"
              name="durationMins"
              type="number"
              min={15}
              max={240}
              step={15}
              defaultValue={60}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Interviewers</Label>
            {interviewers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No interviewers in this organization yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                {interviewers.map((interviewer) => (
                  <label key={interviewer.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="interviewerIds" value={interviewer.id} />
                    {interviewer.name}
                    <span className="text-muted-foreground">({interviewer.role})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" disabled={applications.length === 0 || interviewers.length === 0}>
            Schedule
          </Button>
        </form>
      </Card>
    </div>
  );
}
