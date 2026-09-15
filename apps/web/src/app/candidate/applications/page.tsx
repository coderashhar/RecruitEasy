import Link from "next/link";
import { PageHeader, SectionLabel } from "@/components/broadsheet/section";
import { CandidateApplicationRows } from "@/components/dashboard/candidate-lists";
import { Button } from "@/components/ui/button";
import { getCandidateOverview } from "@/lib/queries";
import { requireCurrentUser } from "@/lib/users";

export default async function CandidateApplicationsPage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const { applications } = await getCandidateOverview(user.id);
  const rows = applications.map((application) => ({
    ...application,
    atsScore: application.resumes[0]?.atsReports[0]?.score ?? null,
  }));
  const open = rows.filter((row) => row.status !== "HIRED" && row.status !== "REJECTED");
  const closed = rows.filter((row) => row.status === "HIRED" || row.status === "REJECTED");

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Applications"
        description={`${applications.length} application${applications.length === 1 ? "" : "s"} · open one for its ATS breakdown`}
        actions={<Button variant="outline" nativeButton={false} render={<Link href="/jobs">Browse jobs</Link>} />}
      />
      <section aria-labelledby="open" className="mt-[30px]">
        <SectionLabel id="open">In progress</SectionLabel>
        {open.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing in progress.</p>
        ) : (
          <CandidateApplicationRows applications={open} />
        )}
      </section>
      {closed.length > 0 && (
        <section aria-labelledby="closed" className="mt-10">
          <SectionLabel id="closed">Decided</SectionLabel>
          <CandidateApplicationRows applications={closed} />
        </section>
      )}
    </div>
  );
}
