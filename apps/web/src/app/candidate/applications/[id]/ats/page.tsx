import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/users";
import { getAtsReportForCandidate } from "@/lib/queries";

const CATEGORY_LABELS: Record<string, string> = {
  grammar: "Grammar",
  impact: "Impact",
  formatting: "Formatting",
  keyword: "Keywords",
};

export default async function AtsReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  const application = await getAtsReportForCandidate(id, user.id);
  if (!application) notFound();

  const resume = application.resumes[0];
  const report = resume?.atsReports[0];

  if (!report) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {resume
              ? "Your resume is being analyzed. Check back in a moment."
              : "No resume uploaded for this application."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const skillsMatch = report.skillsMatch as {
    matched: string[];
    partial: string[];
    missing: string[];
  };
  const suggestions = report.suggestions as Array<{
    category: string;
    message: string;
  }>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">ATS Report</h1>
        <p className="text-sm text-muted-foreground">{application.job.title}</p>
      </div>

      {/* Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Score</span>
            <span
              className={`text-3xl font-bold ${
                report.score >= 70
                  ? "text-emerald-600"
                  : report.score >= 50
                    ? "text-amber-600"
                    : "text-destructive"
              }`}
            >
              {report.score}/100
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                report.score >= 70
                  ? "bg-emerald-500"
                  : report.score >= 50
                    ? "bg-amber-500"
                    : "bg-destructive"
              }`}
              style={{ width: `${report.score}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Scored by {report.source === "LLM" ? `AI (${report.model})` : "keyword analysis"}
          </p>
        </CardContent>
      </Card>

      {/* Skills match */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skills match</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {skillsMatch.matched.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-emerald-600">Matched</p>
              <div className="flex flex-wrap gap-1.5">
                {skillsMatch.matched.map((skill) => (
                  <Badge key={skill} variant="secondary" className="bg-emerald-100 text-emerald-700">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {skillsMatch.partial.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-amber-600">Partial</p>
              <div className="flex flex-wrap gap-1.5">
                {skillsMatch.partial.map((skill) => (
                  <Badge key={skill} variant="secondary" className="bg-amber-100 text-amber-700">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {skillsMatch.missing.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-destructive">Missing</p>
              <div className="flex flex-wrap gap-1.5">
                {skillsMatch.missing.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-destructive">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Missing keywords */}
      {report.missingKeywords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Missing keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {report.missingKeywords.map((keyword) => (
                <Badge key={keyword} variant="outline">
                  {keyword}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-[10px]">
                    {CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
                  </Badge>
                  <span>{suggestion.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
