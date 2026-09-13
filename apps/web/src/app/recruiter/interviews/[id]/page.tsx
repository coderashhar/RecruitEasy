import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewStatus } from "@interviewhub/db";
import { InterviewStatusActions } from "@/components/interview/interview-status-actions";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { getInterviewDetail } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";
import { FeedbackForm } from "./feedback-form";
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
const RECOMMENDATION_LABEL: Record<string, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no",
};

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

  // Eligibility to give feedback is per-interview, not per-platform-role —
  // the same boundary submitFeedback enforces server-side. A recruiter who
  // actually sat in as the interviewer gets the form; one who didn't doesn't.
  const isInterviewerHere = interview.participants.some(
    (participant) => participant.userId === user.id && participant.role === "INTERVIEWER",
  );
  const myFeedback = interview.feedback.find((entry) => entry.interviewerId === user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>
              {interview.application.candidate.name} — {interview.application.job.title}
            </CardTitle>
            <CardDescription>
              Round {interview.round} ·{" "}
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
            {interview.status === "COMPLETED" && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    href={`/recruiter/schedule?applicationId=${interview.applicationId}&round=${interview.round + 1}`}
                  >
                    Schedule round {interview.round + 1}
                  </Link>
                }
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
          <CardTitle>Chat</CardTitle>
          <CardDescription>
            {interview.chatMessages.length === 0
              ? "Nothing was said in the room's chat."
              : `${interview.chatMessages.length} message${interview.chatMessages.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        {interview.chatMessages.length > 0 && (
          <CardContent className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
            {interview.chatMessages.map((message) => (
              <div key={message.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{message.user.name}:</span> {message.body}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {message.createdAt.toLocaleTimeString()}
                </span>
              </div>
            ))}
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

      <Card>
        <CardHeader>
          <CardTitle>Feedback</CardTitle>
          <CardDescription>
            {interview.feedback.length === 0
              ? "No feedback submitted yet."
              : `${interview.feedback.length} submitted.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {interview.feedback.map((entry) => {
            const scores = entry.rubricScores as Record<string, number>;
            return (
              <div key={entry.id} className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{entry.interviewer.name}</span>
                  <Badge variant="secondary">
                    {RECOMMENDATION_LABEL[entry.recommendation] ?? entry.recommendation}
                  </Badge>
                </div>
                <div className="text-muted-foreground">
                  {RUBRIC_CRITERIA.map(({ key, label }) => `${label} ${scores?.[key] ?? "—"}/5`).join(
                    " · ",
                  )}
                </div>
                {entry.notes && <p className="whitespace-pre-wrap">{entry.notes}</p>}
              </div>
            );
          })}

          {isInterviewerHere && (
            <FeedbackForm
              interviewId={interview.id}
              existing={
                myFeedback
                  ? {
                      rubricScores: myFeedback.rubricScores as Record<string, number>,
                      notes: myFeedback.notes,
                      recommendation: myFeedback.recommendation,
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
