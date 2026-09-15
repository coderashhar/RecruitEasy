import { notFound } from "next/navigation";
import { StatMeasure } from "@/components/broadsheet/measures";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { StatusGlyph } from "@/components/broadsheet/status-badge";
import { requireCurrentUser } from "@/lib/users";
import { getAtsReportForCandidate } from "@/lib/queries";
import { PolishButton } from "./polish-button";

const CATEGORY_LABELS: Record<string, string> = {
  grammar: "Grammar",
  impact: "Impact",
  formatting: "Formatting",
  keyword: "Keywords",
};

const SKILL_GROUPS = [
  { key: "matched", label: "Matched", shape: "square", tone: "success" },
  { key: "partial", label: "Partial", shape: "half", tone: "info" },
  { key: "missing", label: "Missing", shape: "bar", tone: "danger" },
] as const;

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
      <div className="flex max-w-[880px] flex-col">
        <PageHeader eyebrow={application.job.title} title="ATS report" />
        <p className="mt-7 border-t border-rule-strong py-5 text-sm text-muted-foreground">
          {resume ? "Your résumé is being analysed. Check back in a moment." : "No résumé uploaded for this application."}
        </p>
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
    <div className="flex max-w-[880px] flex-col">
      <PageHeader
        eyebrow={application.job.title}
        title="ATS report"
        description="How your résumé reads against this job's required skills"
      />

      <div className="mt-7 border-t border-b border-t-rule-strong border-b-border">
        <StatMeasure
          label="Score"
          value={
            <>
              {report.score}
              <span className="ml-1 text-2xl text-muted-foreground">/100</span>
            </>
          }
          detail={
            <>
              <span className="mt-1 mb-3 block h-[9px] w-full max-w-md bg-hairline" aria-hidden="true">
                <span className="block h-[9px] bg-foreground" style={{ width: `${report.score}%` }} />
              </span>
              Scored by {report.source === "LLM" ? `AI (${report.model})` : "keyword analysis"}
            </>
          }
        />
      </div>

      <section aria-labelledby="skills" className="mt-9">
        <SectionLabel id="skills">Skills match</SectionLabel>
        {SKILL_GROUPS.map((group) => (
          <div
            key={group.key}
            className="grid gap-2 border-b border-hairline py-3.5 text-sm last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
          >
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
              <StatusGlyph shape={group.shape} tone={group.tone} />
              {group.label}
            </span>
            <span className={group.key === "missing" ? "text-muted-foreground" : ""}>
              {skillsMatch[group.key].length > 0 ? skillsMatch[group.key].join(", ") : "—"}
            </span>
          </div>
        ))}
      </section>

      {report.missingKeywords.length > 0 && (
        <section aria-labelledby="keywords" className="mt-9">
          <SectionLabel id="keywords">Missing keywords</SectionLabel>
          <p className="mt-3.5 text-sm leading-relaxed">{report.missingKeywords.join(", ")}</p>
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions" className="mt-9">
          <SectionLabel id="suggestions">Suggestions</SectionLabel>
          <ul>
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                className="grid gap-1 border-b border-hairline py-3.5 text-sm last:border-b-0 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4"
              >
                <span className="font-mono text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                  {CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
                </span>
                <span className="leading-relaxed">{suggestion.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-9">
        <PolishButton applicationId={id} />
      </div>
    </div>
  );
}
