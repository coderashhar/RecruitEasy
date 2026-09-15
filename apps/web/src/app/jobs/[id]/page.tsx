import Link from "next/link";
import { notFound } from "next/navigation";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { requireCurrentUser } from "@/lib/users";
import { getJobDetail, hasApplied } from "@/lib/queries";
import { ApplyForm } from "./apply-form";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCurrentUser(["CANDIDATE"]);

  const job = await getJobDetail(user.orgId, id);
  if (!job) notFound();

  const alreadyApplied = await hasApplied(job.id, user.id);

  return (
    <div className="flex max-w-[760px] flex-col">
      <Link href="/jobs" className="mb-4 text-[13.5px] text-primary hover:underline">
        ← All open jobs
      </Link>
      <PageHeader
        title={job.title}
        description={`${job._count.applications} applicant${job._count.applications !== 1 ? "s" : ""} so far`}
      />

      {job.requiredSkills.length > 0 && (
        <section aria-labelledby="skills" className="mt-7">
          <SectionLabel id="skills">Required skills</SectionLabel>
          <p className="mt-3.5 text-sm">{job.requiredSkills.join(" · ")}</p>
        </section>
      )}

      <section aria-labelledby="about" className="mt-8">
        <SectionLabel id="about">About the role</SectionLabel>
        <p className="mt-3.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{job.description}</p>
      </section>

      <div className="mt-10">
        {alreadyApplied ? (
          <CalloutBanner
            tone="success"
            title="You have applied to this position"
            action={
              <Link href="/candidate/applications" className="text-[13.5px] text-primary hover:underline">
                See where it stands
              </Link>
            }
          />
        ) : (
          <ApplyForm jobId={job.id} />
        )}
      </div>
    </div>
  );
}
