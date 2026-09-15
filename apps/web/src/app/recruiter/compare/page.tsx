import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import { ScoreBar } from "@/components/broadsheet/measures";
import { PageHeader } from "@/components/broadsheet/section";
import {
  ApplicationStatusBadge,
  RECOMMENDATION_ORDER,
  RecommendationBadge,
} from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  getComparison,
  parseCompareIds,
  type ComparisonColumn,
} from "@/lib/candidate-profile";
import { requireCurrentUser } from "@/lib/users";

/** The best value in a row gets emphasis — only when there is a single best. */
function leaderIndex(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) return null;
  const best = Math.max(...present);
  const leaders = values.flatMap((value, index) => (value === best ? [index] : []));
  return leaders.length === 1 ? leaders[0] : null;
}

function Row({
  label,
  columns,
  render,
  numeric,
}: {
  label: string;
  columns: ComparisonColumn[];
  render: (column: ComparisonColumn) => ReactNode;
  numeric?: (column: ComparisonColumn) => number | null;
}) {
  const leader = numeric ? leaderIndex(columns.map(numeric)) : null;
  return (
    <tr className="border-b border-hairline align-top last:border-b-0">
      <th
        scope="row"
        className="w-[184px] py-3.5 pr-4 text-left font-mono text-[11px] font-normal tracking-[0.1em] text-muted-foreground uppercase"
      >
        {label}
      </th>
      {columns.map((column, index) => (
        <td
          key={column.applicationId}
          className={`py-3.5 pr-5 text-sm tabular-nums ${index === leader ? "font-semibold" : ""}`}
        >
          {render(column)}
        </td>
      ))}
    </tr>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { user } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const ids = parseCompareIds((await searchParams).ids);

  if (!ids) {
    return (
      <div className="flex max-w-[640px] flex-col">
        <PageHeader
          title="Pick candidates to compare"
          description={`Select ${COMPARE_MIN} to ${COMPARE_MAX} applications in the pipeline, then choose Compare.`}
        />
        <Link href="/recruiter" className="mt-6 text-sm text-primary hover:underline">
          Back to the pipeline
        </Link>
      </div>
    );
  }

  const columns = await getComparison(user.orgId, ids);
  if (!columns) notFound();

  const jobs = [...new Set(columns.map((column) => column.jobTitle))];

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow={`Compare · ${columns.length} candidates`}
        title={jobs.length === 1 ? jobs[0] : "Compare candidates"}
        description="Scores are averages of submitted feedback across every round. A row's outright leader is in bold."
        actions={<Button variant="outline" nativeButton={false} render={<Link href="/recruiter">Change selection</Link>} />}
      />

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="w-[184px]" />
              {columns.map((column) => (
                <th key={column.applicationId} scope="col" className="pr-5 pb-3 text-left align-bottom">
                  <Link
                    href={`/recruiter/candidates/${column.applicationId}`}
                    className="text-[15.5px] font-semibold hover:underline"
                  >
                    {column.shortlisted && (
                      <span className="text-primary" aria-label="Shortlisted">
                        ★{" "}
                      </span>
                    )}
                    {column.candidateName}
                  </Link>
                  <div className="mt-[3px] text-[12.5px] font-normal text-muted-foreground">
                    {jobs.length > 1 ? `${column.jobTitle} · ` : ""}
                    {column.roundsCompleted} of {column.roundsTotal} rounds done
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Status" columns={columns} render={(column) => <ApplicationStatusBadge status={column.status} />} />
            <Row
              label="ATS score"
              columns={columns}
              numeric={(column) => column.atsScore}
              render={(column) => <ScoreBar value={column.atsScore} width={50} className="justify-start" />}
            />
            {RUBRIC_CRITERIA.map(({ key, label }) => (
              <Row
                key={key}
                label={label}
                columns={columns}
                numeric={(column) => column.feedback.averages[key]}
                render={(column) => {
                  const average = column.feedback.averages[key];
                  return average === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <span className="font-mono">{average.toFixed(1)}</span>
                      <span className="ml-2 text-[12.5px] font-normal text-muted-foreground">of 5</span>
                    </>
                  );
                }}
              />
            ))}
            <Row
              label="Recommendation"
              columns={columns}
              render={(column) =>
                column.feedback.count === 0 ? (
                  <span className="text-muted-foreground">No feedback yet</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {[...RECOMMENDATION_ORDER]
                      .reverse()
                      .filter((key) => column.feedback.recommendations[key] > 0)
                      .map((key) => (
                        <RecommendationBadge key={key} recommendation={key}>
                          {column.feedback.recommendations[key]} of {column.feedback.count}
                        </RecommendationBadge>
                      ))}
                  </div>
                )
              }
            />
            <Row
              label="Skills matched"
              columns={columns}
              render={(column) =>
                column.matchedSkills.length ? column.matchedSkills.join(", ") : <span className="text-muted-foreground">—</span>
              }
            />
            <Row
              label="Skills missing"
              columns={columns}
              render={(column) =>
                column.missingSkills.length ? column.missingSkills.join(", ") : <span className="text-muted-foreground">—</span>
              }
            />
            <Row
              label="Integrity signals"
              columns={columns}
              render={(column) => <span className="font-mono">{column.integritySignals}</span>}
            />
          </tbody>
        </table>
      </div>
      <p className="mt-5 border-t border-rule-strong pt-4 text-[13px] text-muted-foreground">
        Scores are averages of submitted feedback only. Integrity signals are context, never a verdict.
      </p>
    </div>
  );
}
