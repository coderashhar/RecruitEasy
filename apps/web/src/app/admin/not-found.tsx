import { NotFoundState } from "@/components/errors/not-found-state";

export default function SegmentNotFound() {
  return <NotFoundState backHref="/admin/audit" backLabel="Back to the audit log" />;
}
