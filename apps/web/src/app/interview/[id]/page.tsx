import { notFound } from "next/navigation";
import { InterviewRoom } from "@/components/interview/interview-room";
import { authorizeInterviewAccess } from "@/lib/interview-access";
import { mintInterviewToken } from "@/lib/interview-token";
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

  const token = mintInterviewToken({
    interviewId: access.interview.id,
    userId: user.id,
    role: access.participantRole,
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <InterviewRoom
        interviewId={access.interview.id}
        token={token}
        role={access.participantRole}
      />
    </div>
  );
}
