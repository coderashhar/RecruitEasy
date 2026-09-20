import { NotFoundState } from "@/components/errors/not-found-state";

export default function SegmentNotFound() {
  return <NotFoundState backHref="/settings/calendar" backLabel="Back to settings" />;
}
