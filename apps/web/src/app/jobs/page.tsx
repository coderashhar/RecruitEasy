import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/users";
import { getJobListings } from "@/lib/queries";

export default async function JobsPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const jobs = await getJobListings(user.orgId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Open positions</h1>
        <p className="text-sm text-muted-foreground">
          Browse available roles and apply with your resume.
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No open positions right now. Check back later.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-base">{job.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {job.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  {job.requiredSkills.slice(0, 5).map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                  {job.requiredSkills.length > 5 && (
                    <span className="text-xs text-muted-foreground">
                      +{job.requiredSkills.length - 5} more
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {job._count.applications} applicant{job._count.applications !== 1 ? "s" : ""}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
