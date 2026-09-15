import { Wordmark } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";
import { setRole } from "./actions";

const OPTIONS = [
  { role: "CANDIDATE", label: "Candidate", blurb: "I'm interviewing for a role." },
  { role: "RECRUITER", label: "Recruiter", blurb: "I schedule interviews and manage the pipeline." },
  { role: "INTERVIEWER", label: "Interviewer", blurb: "I run technical interviews and write feedback." },
] as const;

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center px-6 py-16">
      <Wordmark />
      <h1 className="mt-10 text-[34px] leading-tight font-semibold tracking-[-0.03em]">One more step</h1>
      <p className="mt-2 text-[14.5px] text-muted-foreground">Tell us which side of the table you&apos;re on.</p>
      <div className="mt-8 border-t border-rule-strong">
        {OPTIONS.map((option) => (
          <form
            key={option.role}
            action={setRole}
            className="flex items-center justify-between gap-5 border-b border-hairline py-[18px] last:border-b-0"
          >
            <input type="hidden" name="role" value={option.role} />
            <div>
              <div className="text-base font-semibold tracking-[-0.015em]">{option.label}</div>
              <div className="mt-1 text-[13.5px] text-muted-foreground">{option.blurb}</div>
            </div>
            <Button type="submit" variant="outline">
              Continue
            </Button>
          </form>
        ))}
      </div>
      <p className="mt-5 font-mono text-[11.5px] text-muted-foreground">
        Admin access is granted by your organisation, not chosen here
      </p>
    </div>
  );
}
