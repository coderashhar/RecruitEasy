import Link from "next/link";
import { PageHeader } from "@/components/broadsheet/section";
import { requireCurrentUser } from "@/lib/users";
import { getJobListings } from "@/lib/queries";

export default async function JobsPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const jobs = await getJobListings(user.orgId);

  return (
    <div className="flex max-w-[880px] flex-col">
      <PageHeader title="Open positions" description="Browse available roles and apply with your résumé" />

      {jobs.length === 0 ? (
        <p className="mt-7 border-t border-rule-strong py-5 text-sm text-muted-foreground">
          No open positions right now. Check back later.
        </p>
      ) : (
        <ul className="mt-7 border-t border-rule-strong">
          {jobs.map((job) => (
            <li key={job.id} className="border-b border-hairline last:border-b-0">
              <Link href={`/jobs/${job.id}`} className="group block py-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-base font-semibold tracking-[-0.015em] group-hover:underline">{job.title}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                    {job._count.applications} applicant{job._count.applications !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
                {job.requiredSkills.length > 0 && (
                  <p className="mt-2 font-mono text-[12px] text-foreground/75">
                    {job.requiredSkills.slice(0, 6).join(" · ")}
                    {job.requiredSkills.length > 6 && ` · +${job.requiredSkills.length - 6}`}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
