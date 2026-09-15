import Link from "next/link";
import type { ApplicationStatus, InterviewStatus } from "@interviewhub/db";
import { LocalTime } from "@/components/broadsheet/local-time";
import { ApplicationStatusBadge, InterviewStatusBadge } from "@/components/broadsheet/status-badge";

export interface CandidateApplicationItem {
  id: string;
  status: ApplicationStatus;
  createdAt: Date;
  job: { title: string };
  atsScore: number | null;
}

/** One line per application: where it stands, and the ATS breakdown when there is one. */
export function CandidateApplicationRows({ applications }: { applications: CandidateApplicationItem[] }) {
  return (
    <ul>
      {applications.map((application) => (
        <li
          key={application.id}
          className="flex flex-col gap-2.5 border-b border-hairline py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-5"
        >
          <div className="min-w-0">
            <div className="text-[15px] font-medium">{application.job.title}</div>
            <div className="mt-[3px] text-[13px] text-muted-foreground">
              applied <LocalTime value={application.createdAt} format="date" />
              {application.atsScore !== null && (
                <>
                  {" · ATS "}
                  <span className="font-mono tabular-nums">{application.atsScore}/100</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ApplicationStatusBadge status={application.status} />
            {application.atsScore !== null && (
              <Link
                href={`/candidate/applications/${application.id}/ats`}
                className="text-[13.5px] text-primary hover:underline"
              >
                Open
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface CandidateInterviewItem {
  id: string;
  status: InterviewStatus;
  scheduledAt: Date;
  durationMins: number;
  round: number;
  application: { job: { title: string } };
  participants?: Array<{ user: { name: string } }>;
}

export function CandidateInterviewRows({
  interviews,
  joinable,
}: {
  interviews: CandidateInterviewItem[];
  /** Upcoming interviews link into the room; past ones only report how they ended. */
  joinable?: boolean;
}) {
  return (
    <ul>
      {interviews.map((interview) => {
        const panel = interview.participants?.map((participant) => participant.user.name) ?? [];
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
              <div className="text-[14.5px] font-semibold">{interview.application.job.title}</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">
                Round {interview.round} · {interview.durationMins} min
                {panel.length > 0 && ` · with ${panel.join(", ")}`}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {joinable ? (
                <Link href={`/interview/${interview.id}`} className="text-[13.5px] text-primary hover:underline">
                  Open room
                </Link>
              ) : (
                <InterviewStatusBadge status={interview.status} />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
