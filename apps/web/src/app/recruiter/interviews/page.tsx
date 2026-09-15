import Link from "next/link";
import { LocalTime } from "@/components/broadsheet/local-time";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { InterviewStatusBadge } from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { getInterviewList } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

type InterviewListItem = Awaited<ReturnType<typeof getInterviewList>>["upcoming"][number];

function InterviewRows({ interviews, userId }: { interviews: InterviewListItem[]; userId: string }) {
  return (
    <ul>
      {interviews.map((interview) => {
        const panel = interview.participants.map((participant) =>
          participant.userId === userId ? "you" : participant.user.name,
        );
        const isParticipant = interview.participants.some((participant) => participant.userId === userId);
        const live = interview.status === "SCHEDULED" || interview.status === "IN_PROGRESS";
        return (
          <li
            key={interview.id}
            className="grid gap-x-6 gap-y-2 border-b border-hairline py-[15px] last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center"
          >
            <LocalTime
              value={interview.scheduledAt}
              format="weekdayTime"
              className="font-mono text-[12.5px] text-muted-foreground tabular-nums"
            />
            <div className="min-w-0">
              <Link href={`/recruiter/interviews/${interview.id}`} className="text-[14.5px] font-semibold hover:underline">
                {interview.application.candidate.name}
              </Link>
              <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {interview.application.job.title} · round {interview.round} · {interview.durationMins} min
                {panel.length > 0 && ` · with ${panel.join(", ")}`}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <InterviewStatusBadge status={interview.status} />
              {live && isParticipant && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/interview/${interview.id}`}>Join</Link>} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function InterviewsPage() {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  // Interviewers see the interviews they sit in on; recruiters own the whole org's calendar.
  const mine = role === "INTERVIEWER";
  const { upcoming, past } = await getInterviewList(user.orgId, mine ? user.id : undefined);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={mine ? "My interviews" : "Interviews"}
        description={`${upcoming.length} upcoming · times shown in your timezone`}
        actions={
          !mine && <Button nativeButton={false} render={<Link href="/recruiter/schedule">Schedule interview</Link>} />
        }
      />

      <section aria-labelledby="upcoming" className="mt-[30px]">
        <SectionLabel id="upcoming" aside={upcoming.length > 0 ? "soonest first" : undefined}>
          Upcoming and live
        </SectionLabel>
        {upcoming.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing on the calendar.</p>
        ) : (
          <InterviewRows interviews={upcoming} userId={user.id} />
        )}
      </section>

      <section aria-labelledby="past" className="mt-10">
        <SectionLabel id="past" aside={past.length === 50 ? "latest 50" : undefined}>
          Past
        </SectionLabel>
        {past.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No past interviews yet.</p>
        ) : (
          <InterviewRows interviews={past} userId={user.id} />
        )}
      </section>
    </div>
  );
}
