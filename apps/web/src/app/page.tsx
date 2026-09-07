import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        InterviewHub AI
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Video, live coding, and resume intelligence — one interview, one tab.
      </h1>
      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/sign-up">Get started</Link>} />
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/sign-in">Sign in</Link>}
        />
      </div>
    </div>
  );
}
