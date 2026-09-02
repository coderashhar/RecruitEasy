import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewStatus } from "@interviewhub/db";
import { InterviewStatusActions } from "@/components/interview/interview-status-actions";
import { getInterviewDetail } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { RescheduleForm } from "./reschedule-form";

const STATUS_VARIANT: Record<InterviewStatus, "default" | "secondary" | "outline" | "destructive"> = {
  SCHEDULED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

// Advisory-only, per interview-room.tsx and the PRD's anti-cheat risk
// mitigation — shown here as a plain log, never as a verdict on the candidate.
const INTEGRITY_SIGNAL_LABEL: Record<string, string> = {
  TAB_BLUR: "Switched away from the tab",
  PASTE: "Pasted into the editor",
  FULLSCREEN_EXIT: "Exited fullscreen",
};

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  const interview = await getInterviewDetail(user.orgId, id);
  if (!interview) notFound();

  // INTERVIEWER can view this page (they may need to review it) but doesn't
  // own pipeline decisions — matches scheduleInterview/changeInterviewStatus's
  // own RECRUITER/ADMIN-only restriction.
  const canManage = role === "RECRUITER" || role === "ADMIN";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>
              {interview.application.candidate.name} — {interview.application.job.title}
            </CardTitle>
            <CardDescription>
              {interview.scheduledAt.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {interview.durationMins} min
            </CardDescription>
          </div>
          <Badge variant={STATUS_VARIANT[interview.status]}>{interview.status}</Badge>
        </CardHeader>
        {canManage && (
          <CardContent className="flex flex-col gap-4">
            <InterviewStatusActions interviewId={interview.id} status={interview.status} />
            {interview.status === "SCHEDULED" && (
              <RescheduleForm
                interviewId={interview.id}
                scheduledAt={interview.scheduledAt}
                durationMins={interview.durationMins}
              />
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {interview.participants.map((participant) => (
            <div key={participant.id} className="flex items-center justify-between text-sm">
              <span>{participant.user.name}</span>
              <span className="text-muted-foreground">{participant.role}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Code</CardTitle>
          <CardDescription>
            {interview.codeDocument
              ? `Last saved as ${interview.codeDocument.language}.`
              : "Nothing persisted yet — the room hasn't been joined."}
          </CardDescription>
        </CardHeader>
        {interview.codeDocument?.finalCode && (
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
              <code>{interview.codeDocument.finalCode}</code>
            </pre>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrity signals</CardTitle>
          <CardDescription>
            {interview.integritySignals.length === 0
              ? "None recorded."
              : "Advisory only — not a verdict on the candidate."}
          </CardDescription>
        </CardHeader>
        {interview.integritySignals.length > 0 && (
          <CardContent className="flex flex-col gap-1.5">
            {interview.integritySignals.map((signal) => (
              <div key={signal.id} className="flex items-center justify-between text-sm">
                <span>{INTEGRITY_SIGNAL_LABEL[signal.type] ?? signal.type}</span>
                <span className="text-muted-foreground">
                  {signal.occurredAt.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
