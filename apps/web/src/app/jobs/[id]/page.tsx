import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{job.title}</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            {job.requiredSkills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {job.description}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {job._count.applications} applicant{job._count.applications !== 1 ? "s" : ""} so far
          </p>
        </CardContent>
      </Card>

      {alreadyApplied ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            You have already applied to this position.
          </CardContent>
        </Card>
      ) : (
        <ApplyForm jobId={job.id} />
      )}
    </div>
  );
}
