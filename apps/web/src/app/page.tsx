import Link from "next/link";
import { Wordmark } from "@/components/layout/app-nav";
import { Button } from "@/components/ui/button";

const PILLARS = [
  { label: "Video", text: "A room that works in the browser, recorded for the panel when you choose." },
  { label: "Live coding", text: "One shared editor, run in a sandbox, synced as both people type." },
  { label: "Résumé intelligence", text: "Every application scored against the job's skills, with the gaps named." },
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-1 flex-col px-6 py-10 sm:px-12">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link href="/sign-in" className="text-[13.5px] text-primary hover:underline">
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <div className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">InterviewHub AI</div>
        <h1 className="mt-4 max-w-3xl text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[56px]">
          Video, live coding, and résumé intelligence — one interview, one tab.
        </h1>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/sign-up">Get started</Link>} />
          <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/sign-in">Sign in</Link>} />
        </div>

        <div className="mt-16 grid border-t border-rule-strong sm:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <div
              key={pillar.label}
              className={index > 0 ? "border-border py-5 max-sm:border-t sm:border-l sm:pl-8" : "py-5 sm:pr-8"}
            >
              <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{pillar.label}</div>
              <p className="mt-2.5 text-sm leading-relaxed">{pillar.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
