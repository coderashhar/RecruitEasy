"use client";

import { ErrorState, type RouteError } from "@/components/errors/error-state";
import { PlainFrame } from "@/components/errors/plain-frame";

export default function RootError({ error, reset }: { error: RouteError; reset: () => void }) {
  return (
    <PlainFrame>
      <ErrorState error={error} reset={reset} backHref="/" backLabel="Go to the home page" />
    </PlainFrame>
  );
}
