import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setRole } from "./actions";

const OPTIONS = [
  { role: "CANDIDATE", label: "Candidate", blurb: "I'm interviewing for a role." },
  { role: "RECRUITER", label: "Recruiter", blurb: "I schedule and manage the pipeline." },
  { role: "INTERVIEWER", label: "Interviewer", blurb: "I run technical interviews." },
] as const;

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">One more step</h1>
        <p className="text-muted-foreground">Tell us which side of the table you&apos;re on.</p>
      </div>
      {OPTIONS.map((opt) => (
        <form key={opt.role} action={setRole}>
          <input type="hidden" name="role" value={opt.role} />
          <Card className="transition-colors hover:border-foreground/30">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle>{opt.label}</CardTitle>
                <CardDescription>{opt.blurb}</CardDescription>
              </div>
              <Button type="submit" variant="secondary">Continue</Button>
            </CardHeader>
          </Card>
        </form>
      ))}
    </div>
  );
}
