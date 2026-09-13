import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackRecommendation } from "@interviewhub/db";
import { RUBRIC_CRITERIA } from "@interviewhub/types";
import {
  COMPARE_MAX,
  COMPARE_MIN,
  getComparison,
  parseCompareIds,
  type ComparisonColumn,
} from "@/lib/candidate-profile";
import { requireCurrentUser } from "@/lib/users";

const RECOMMENDATION_LABEL: Record<FeedbackRecommendation, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no",
};

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
    <tr className="border-t align-top">
      <th scope="row" className="w-40 py-2.5 pr-4 text-left text-xs font-medium text-muted-foreground">
        {label}
      </th>
      {columns.map((column, index) => (
        <td
          key={column.applicationId}
          className={`py-2.5 pr-4 text-sm tabular-nums ${index === leader ? "font-semibold" : ""}`}
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
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Pick candidates to compare</CardTitle>
          <CardDescription>
            Select {COMPARE_MIN} to {COMPARE_MAX} applications in the pipeline, then choose Compare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/recruiter" className="text-sm text-primary hover:underline">
            Back to the pipeline
          </Link>
        </CardContent>
      </Card>
    );
  }

  const columns = await getComparison(user.orgId, ids);
  if (!columns) notFound();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare candidates</CardTitle>
        <CardDescription>
          Feedback is averaged across every round. Where one candidate leads a row outright, their value is in bold.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className="w-40" />
              {columns.map((column) => (
                <th key={column.applicationId} scope="col" className="pb-3 pr-4 text-left align-bottom">
                  <Link
                    href={`/recruiter/candidates/${column.applicationId}`}
                    className="font-semibold hover:underline"
                  >
                    {column.shortlisted && <span className="text-amber-500" aria-label="Shortlisted">★ </span>}
                    {column.candidateName}
                  </Link>
                  <div className="text-xs font-normal text-muted-foreground">{column.jobTitle}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Status" columns={columns} render={(column) => <Badge variant="outline">{column.status}</Badge>} />
            <Row
              label="ATS score"
              columns={columns}
              numeric={(column) => column.atsScore}
              render={(column) => (column.atsScore !== null ? `${column.atsScore}/100` : "—")}
            />
            <Row
              label="Skills matched"
              columns={columns}
              render={(column) => (column.matchedSkills.length ? column.matchedSkills.join(", ") : "—")}
            />
            <Row
              label="Skills missing"
              columns={columns}
              render={(column) => (column.missingSkills.length ? column.missingSkills.join(", ") : "—")}
            />
            {RUBRIC_CRITERIA.map(({ key, label }) => (
              <Row
                key={key}
                label={label}
                columns={columns}
                numeric={(column) => column.feedback.averages[key]}
                render={(column) => {
                  const average = column.feedback.averages[key];
                  return average !== null ? `${average}/5` : "—";
                }}
              />
            ))}
            <Row
              label="Recommendations"
              columns={columns}
              render={(column) =>
                column.feedback.count === 0 ? (
                  "—"
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(RECOMMENDATION_LABEL) as FeedbackRecommendation[])
                      .filter((key) => column.feedback.recommendations[key] > 0)
                      .map((key) => (
                        <Badge key={key} variant={key === "NO" || key === "STRONG_NO" ? "outline" : "secondary"}>
                          {RECOMMENDATION_LABEL[key]} × {column.feedback.recommendations[key]}
                        </Badge>
                      ))}
                  </div>
                )
              }
            />
            <Row
              label="Rounds completed"
              columns={columns}
              render={(column) => `${column.roundsCompleted} of ${column.roundsTotal}`}
            />
            <Row
              label="Integrity signals"
              columns={columns}
              render={(column) => column.integritySignals}
            />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
