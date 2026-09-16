"use client";

import Link from "next/link";
import { StatusPage } from "@/components/broadsheet/status-page";
import { Button } from "@/components/ui/button";
import { friendlyErrorMessage } from "@/lib/error-copy";

export interface RouteError extends Error {
  /** Next.js fills this in production, where the message itself is withheld. */
  digest?: string;
}

/**
 * What every `error.tsx` renders.
 *
 * A thrown Server Action is the common case here — a duplicate application, a
 * job that lost its org — so the page leads with the message the action threw
 * rather than an apology, and keeps the user one click from where they were.
 */
export function ErrorState({
  error,
  reset,
  backHref,
  backLabel,
}: {
  error: RouteError;
  reset: () => void;
  backHref: string;
  backLabel: string;
}) {
  // Only messages the app wrote for a person reach the page; a Prisma dump or
  // a stack frame would say nothing useful and make this look worse than it is.
  const message = friendlyErrorMessage(error.message);

  return (
    <StatusPage
      eyebrow="Something went wrong"
      title={message ?? "That didn't go through"}
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" nativeButton={false} render={<Link href={backHref}>{backLabel}</Link>} />
        </>
      }
      detail={error.digest ? `error digest ${error.digest}` : undefined}
    >
      {message
        ? "Nothing was saved. Fix what the message describes, or go back and try from there."
        : "The page couldn't finish loading. Trying again usually works; if it doesn't, the server log has the details."}
    </StatusPage>
  );
}
