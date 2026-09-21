"use client";

import { ErrorState, type RouteError } from "@/components/errors/error-state";

export default function SegmentError({ error, reset }: { error: RouteError; reset: () => void }) {
  return <ErrorState error={error} reset={reset} backHref="/notifications" backLabel="Back to notifications" />;
}
