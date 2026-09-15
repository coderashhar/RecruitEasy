import Link from "next/link";
import { LocalTime } from "@/components/broadsheet/local-time";
import { PageHeader } from "@/components/broadsheet/section";
import { Button } from "@/components/ui/button";
import { getJobsWithCounts } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function JobsListPage() {
  const { user, role } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);
  const jobs = await getJobsWithCounts(user.orgId);
  const canPost = role !== "INTERVIEWER";

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Jobs"
        description={`${jobs.length} job${jobs.length === 1 ? "" : "s"} posted`}
        actions={canPost && <Button nativeButton={false} render={<Link href="/recruiter/jobs/new">Post job</Link>} />}
      />

      {jobs.length === 0 ? (
        <p className="mt-[30px] border-t border-rule-strong py-5 text-sm text-muted-foreground">
          No jobs yet. {canPost && <Link href="/recruiter/jobs/new" className="text-primary hover:underline">Post the first job</Link>}
        </p>
      ) : (
        <div className="mt-[30px] overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule-strong">
                {["Job", "Required skills", "Active", "Applications", "Posted"].map((heading, index) => (
                  <th
                    key={heading}
                    className={`pb-[9px] font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase ${index >= 2 ? "text-right" : "text-left"}`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-hairline last:border-b-0">
                  <td className="py-3.5 pr-6 font-medium">{job.title}</td>
                  <td className="max-w-[360px] truncate py-3.5 pr-6 text-muted-foreground">
                    {job.requiredSkills.join(", ") || "—"}
                  </td>
                  <td className="py-3.5 text-right font-mono tabular-nums">{job.activeApplications}</td>
                  <td className="py-3.5 text-right font-mono tabular-nums">{job._count.applications}</td>
                  <td className="py-3.5 pl-6 text-right font-mono text-[12.5px] text-muted-foreground">
                    <LocalTime value={job.createdAt} format="date" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
