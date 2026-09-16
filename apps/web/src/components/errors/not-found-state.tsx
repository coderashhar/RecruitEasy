import Link from "next/link";
import { StatusPage } from "@/components/broadsheet/status-page";
import { Button } from "@/components/ui/button";

/**
 * What every `not-found.tsx` renders.
 *
 * `notFound()` is also how the app answers "exists, but not yours" — an
 * interview you aren't a participant of, an application in another
 * organisation — so the copy never implies the record is missing.
 */
export function NotFoundState({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <StatusPage
      eyebrow="404"
      title="This page isn't here"
      actions={<Button nativeButton={false} render={<Link href={backHref}>{backLabel}</Link>} />}
    >
      {children ?? "The link may be wrong, the record may have been deleted, or it may belong to someone else."}
    </StatusPage>
  );
}
