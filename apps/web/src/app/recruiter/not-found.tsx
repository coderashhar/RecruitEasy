import { NotFoundState } from "@/components/errors/not-found-state";

export default function SegmentNotFound() {
  return <NotFoundState backHref="/recruiter" backLabel="Back to the pipeline" />;
}
