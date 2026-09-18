import Link from "next/link";
import { notFound } from "next/navigation";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { LocalTime } from "@/components/broadsheet/local-time";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { InterviewStatusBadge, RecommendationBadge } from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { InterviewStatusActions } from "@/components/interview/interview-status-actions";
import { RecordingPlayer } from "@/components/interview/recording-player";
import { describeIntegritySignal, INTEGRITY_SIGNAL_LABEL } from "@/lib/integrity";
import { getInterviewDetail, getPotentialInterviewers } from "@/lib/queries";
import { getRecordingForReview } from "@/lib/recording";
import { requireCurrentUser } from "@/lib/users";
import { FeedbackForm } from "./feedback-form";
import { AddObserverForm, RemoveObserverButton } from "./observer-controls";
import { RescheduleForm } from "./reschedule-form";

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  const [interview, recording] = await Promise.all([
    getInterviewDetail(user.orgId, id),
    getRecordingForReview(user.orgId, id),
  ]);
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
  const isParticipant = interview.participants.some((participant) => participant.userId === user.id);
  const myFeedback = interview.feedback.find((entry) => entry.interviewerId === user.id);
  const live = interview.status === "SCHEDULED" || interview.status === "IN_PROGRESS";
  const ended = new Date(interview.scheduledAt.getTime() + interview.durationMins * 60_000);
  const feedbackDueAt = new Date(ended.getTime() + 24 * 60 * 60 * 1000);

  // Only someone not already in the room can be added; the candidate's own
  // account is never offered because it can't hold an INTERVIEWER-capable role.
  const canEditObservers = canManage && live;
  const observerCandidates = canEditObservers
    ? (await getPotentialInterviewers(user.orgId)).filter(
        (person) => !interview.participants.some((participant) => participant.userId === person.id),
      )
    : [];

  // A candidate who alt-tabs a lot can leave hundreds of TAB_BLUR rows — cap
  // the list so the page stays a readable length, and fall back to counts.
  const MAX_INTEGRITY_SIGNALS_SHOWN = 20;
  const shownSignals = interview.integritySignals.slice(0, MAX_INTEGRITY_SIGNALS_SHOWN);
  const hiddenSignalCount = interview.integritySignals.length - shownSignals.length;
  const signalCountsByType = interview.integritySignals.reduce<Partial<Record<string, number>>>(
    (counts, signal) => {
      counts[signal.type] = (counts[signal.type] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return (
    <div className="flex max-w-[960px] flex-col">
      <PageHeader
        eyebrow={<>Round {interview.round} · {interview.durationMins} min</>}
        title={
          <Link href={`/recruiter/candidates/${interview.applicationId}`} className="hover:underline">
            {interview.application.candidate.name}
          </Link>
        }
        description={
          <>
            {interview.application.job.title} · <LocalTime value={interview.scheduledAt} format="datetime" />
          </>
        }
        actions={
          <>
            <InterviewStatusBadge status={interview.status} />
            {live && isParticipant && (
              <Button nativeButton={false} render={<Link href={`/interview/${interview.id}`}>Join interview</Link>} />
            )}
          </>
        }
      />

      {canManage && (live || interview.status === "COMPLETED") && (
        <div className="mt-6 flex flex-wrap items-start gap-2.5 border-t border-rule-strong pt-4">
          <InterviewStatusActions
            interviewId={interview.id}
            status={interview.status}
            candidateName={interview.application.candidate.name}
            round={interview.round}
          />
          {interview.status === "SCHEDULED" && (
            <RescheduleForm
              interviewId={interview.id}
              scheduledAt={interview.scheduledAt}
              durationMins={interview.durationMins}
            />
          )}
          {interview.status === "COMPLETED" && (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/recruiter/schedule?applicationId=${interview.applicationId}&round=${interview.round + 1}`}>
                  Schedule round {interview.round + 1}
                </Link>
              }
            />
          )}
        </div>
      )}

      <div className="mt-9 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="feedback-label" id="feedback" className="scroll-mt-24">
            <SectionLabel
              id="feedback-label"
              aside={
                interview.status === "COMPLETED" && isInterviewerHere && !myFeedback ? (
                  <>
                    due by <LocalTime value={feedbackDueAt} format="weekdayTime" />
                  </>
                ) : (
                  `${interview.feedback.length} submitted`
                )
              }
            >
              Feedback
            </SectionLabel>

            {interview.feedback.length === 0 && !isInterviewerHere && (
              <p className="py-4 text-sm text-muted-foreground">No feedback submitted yet.</p>
            )}
            {interview.feedback.map((entry) => {
              const scores = entry.rubricScores as Record<string, number>;
              return (
                <article key={entry.id} className="border-b border-hairline py-4 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[14.5px] font-semibold">{entry.interviewer.name}</span>
                    <RecommendationBadge recommendation={entry.recommendation} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                    {RUBRIC_CRITERIA.map(({ key, label }) => (
                      <span key={key}>
                        {label} <span className="font-mono text-foreground">{scores?.[key] ?? "—"}</span>/5
                      </span>
                    ))}
                  </div>
                  {entry.notes && <p className="mt-2.5 text-sm leading-relaxed whitespace-pre-wrap">{entry.notes}</p>}
                </article>
              );
            })}

            {isInterviewerHere && (
              <div className="mt-6">
                <h3 className="mb-3 text-lg font-semibold tracking-[-0.015em]">
                  {myFeedback ? "Update your feedback" : "Your feedback"}
                </h3>
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
              </div>
            )}
          </section>

          <section aria-labelledby="code">
            <SectionLabel id="code" aside={interview.codeDocument ? interview.codeDocument.language : undefined}>
              Code
            </SectionLabel>
            {interview.codeDocument?.finalCode ? (
              <pre className="mt-4 max-h-96 overflow-auto bg-well p-4 font-mono text-[13px] leading-relaxed text-[oklch(0.9_0.002_85)]">
                <code>{interview.codeDocument.finalCode}</code>
              </pre>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">Nothing persisted yet — the room hasn&apos;t been joined.</p>
            )}
          </section>

          <section aria-labelledby="chat">
            <SectionLabel id="chat" aside={`${interview.chatMessages.length} message${interview.chatMessages.length === 1 ? "" : "s"}`}>
              Chat
            </SectionLabel>
            {interview.chatMessages.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing was said in the room&apos;s chat.</p>
            ) : (
              <div className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto">
                {interview.chatMessages.map((message) => (
                  <div key={message.id} className="text-sm leading-normal">
                    <div className="mb-0.5 text-[11.5px] text-muted-foreground">
                      {message.user.name} · <LocalTime value={message.createdAt} format="time" />
                    </div>
                    <span className="break-words">{message.body}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-10">
          <section aria-labelledby="participants">
            <SectionLabel id="participants">Participants · {interview.participants.length}</SectionLabel>
            {interview.participants.map((participant) => (
              <div key={participant.id} className="flex justify-between gap-4 border-b border-hairline py-[11px] text-[13.5px] last:border-b-0">
                <span>
                  {participant.user.name}
                  {participant.userId === user.id && " (you)"}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{participant.role.toLowerCase()}</span>
                  {canEditObservers && participant.role === "OBSERVER" && (
                    <RemoveObserverButton
                      interviewId={interview.id}
                      userId={participant.userId}
                      name={participant.user.name}
                    />
                  )}
                </span>
              </div>
            ))}
            {canEditObservers && (
              <>
                <AddObserverForm interviewId={interview.id} candidates={observerCandidates} />
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Observers watch and chat. They can&apos;t edit the code or run it.
                </p>
              </>
            )}
          </section>

          <section aria-labelledby="recording">
            <SectionLabel id="recording">Recording</SectionLabel>
            <div className="mt-3.5">
              {!recording ? (
                <p className="text-sm text-muted-foreground">Not recorded. The interviewer can start one from the room.</p>
              ) : recording.status === "READY" ? (
                recording.playbackUrl ? (
                  // The link expires after 15 minutes; the player offers a new one.
                  <RecordingPlayer src={recording.playbackUrl} durationSec={recording.durationSec} />
                ) : (
                  <p className="text-sm text-muted-foreground">This recording isn&apos;t available to play.</p>
                )
              ) : recording.status === "FAILED" ? (
                <CalloutBanner tone="warning" title="This interview wasn't recorded">
                  {recording.error ?? "The recording didn't complete. Everything else from the interview is here."}
                </CalloutBanner>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {recording.status === "EXPIRED"
                    ? (recording.error ?? "This recording has passed its retention period and was deleted.")
                    : recording.status === "PROCESSING"
                      ? "Recording stopped — still being saved. Reload in a minute."
                      : "Recording in progress."}
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="integrity">
            <SectionLabel id="integrity" aside={interview.integritySignals.length > 0 ? "advisory only" : undefined}>
              Integrity signals
            </SectionLabel>
            {interview.integritySignals.length === 0 ? (
              <p className="py-3.5 text-sm text-muted-foreground">None recorded.</p>
            ) : (
              <>
                {hiddenSignalCount > 0 && (
                  <p className="pt-3.5 text-[13px] text-muted-foreground">
                    {Object.entries(signalCountsByType)
                      .map(([type, count]) => `${INTEGRITY_SIGNAL_LABEL[type as keyof typeof INTEGRITY_SIGNAL_LABEL]} × ${count}`)
                      .join(" · ")}
                  </p>
                )}
                {shownSignals.map((signal) => (
                  <div key={signal.id} className="flex justify-between gap-4 border-b border-hairline py-[11px] text-[13.5px] last:border-b-0">
                    <span>{describeIntegritySignal(signal.type, signal.payload)}</span>
                    <LocalTime value={signal.occurredAt} format="time" className="shrink-0 font-mono text-xs text-muted-foreground" />
                  </div>
                ))}
                {hiddenSignalCount > 0 && (
                  <p className="pt-[11px] text-[13.5px] text-muted-foreground">
                    +{hiddenSignalCount} more not shown.
                  </p>
                )}
                <p className="mt-2 text-[13px] text-muted-foreground">Context, not a verdict on the candidate.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
