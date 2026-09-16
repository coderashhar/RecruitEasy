import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/app-nav";

/**
 * Page chrome for the dead ends that land outside the app shell — the root
 * 404, a thrown error above any section layout, the interview room. The
 * wordmark keeps a lost visitor oriented and gives them one way home.
 */
export function PlainFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-[18px] py-8 sm:px-12">
      <Link href="/" aria-label="InterviewHub home" className="self-start">
        <Wordmark />
      </Link>
      <div className="flex flex-1 items-center">{children}</div>
    </div>
  );
}
