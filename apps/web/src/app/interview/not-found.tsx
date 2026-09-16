import { NotFoundState } from "@/components/errors/not-found-state";
import { PlainFrame } from "@/components/errors/plain-frame";

/**
 * `authorizeInterviewAccess` answers "not yours" with the same 404 as "no
 * such interview", so this copy must not confirm that the interview exists.
 */
export default function InterviewNotFound() {
  return (
    <PlainFrame>
      <NotFoundState backHref="/" backLabel="Go to the home page">
        This interview room isn&apos;t available to you. Rooms open only to the people invited to that interview —
        check the link in your invitation, or ask the recruiter to resend it.
      </NotFoundState>
    </PlainFrame>
  );
}
