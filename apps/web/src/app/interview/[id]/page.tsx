import { notFound } from "next/navigation";
import { InterviewRoom } from "@/components/interview/interview-room";
import { authorizeInterviewAccess } from "@/lib/interview-access";
import { mintInterviewToken } from "@/lib/interview-token";
import { isLiveKitConfigured, mintVideoToken } from "@/lib/livekit-token";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Any signed-in role can be a participant (a recruiter or admin can sit in
  // as an OBSERVER) — the real gate is the participant-row check below, not
  // the account's platform role.
  const { user } = await requireCurrentUser(ROLES);

  const access = await authorizeInterviewAccess(id, user.id);
  // 404, not a redirect: a signed-in user probing ids must not be able to
  // distinguish "no such interview" from "exists, but not yours".
  if (!access) notFound();

  // Long enough to outlast the scheduled slot itself, plus room for an
  // interview that runs over — there's no reconnect-time refresh, so a token
  // that expires before the interview realistically ends would strand
  // whoever's still in the room on the next network blip.
  const GRACE_PERIOD_MINUTES = 30;
  const sessionSeconds = (access.interview.durationMins + GRACE_PERIOD_MINUTES) * 60;

  const token = mintInterviewToken({
    interviewId: access.interview.id,
    userId: user.id,
    role: access.participantRole,
    expiresInSeconds: sessionSeconds,
  });

  // Video is optional infrastructure: without LiveKit credentials the room
  // still runs as editor-and-chat rather than failing to render, so nobody
  // needs a LiveKit account just to work on the rest of the app.
  //
  // The room name is Interview.roomName, not the interview id — it is already
  // unique per interview and exists precisely so an external service can
  // address the room without being handed a database id.
  const videoToken = isLiveKitConfigured()
    ? await mintVideoToken({
        roomName: access.interview.roomName,
        userId: user.id,
        displayName: user.name,
        expiresInSeconds: sessionSeconds,
      })
    : null;

  return (
    // Full-bleed, not a centred reading column: this is a tool being operated,
    // and the code under discussion should get the screen it needs.
    <div className="p-4">
      <InterviewRoom
        interviewId={access.interview.id}
        token={token}
        role={access.participantRole}
        currentUserId={user.id}
        roster={access.roster}
        jobTitle={access.jobTitle}
        candidateName={access.candidateName}
        scheduledAt={access.interview.scheduledAt}
        durationMins={access.interview.durationMins}
        status={access.interview.status}
        videoToken={videoToken}
        videoServerUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null}
      />
    </div>
  );
}
