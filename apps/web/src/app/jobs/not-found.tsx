import { NotFoundState } from "@/components/errors/not-found-state";

export default function SegmentNotFound() {
  return <NotFoundState backHref="/jobs" backLabel="Back to open positions" />;
}
