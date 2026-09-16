import { NotFoundState } from "@/components/errors/not-found-state";
import { PlainFrame } from "@/components/errors/plain-frame";

export default function NotFound() {
  return (
    <PlainFrame>
      <NotFoundState backHref="/" backLabel="Go to the home page">
        The link may be wrong, or the page may have moved. If you were signed in, your dashboard is one click away
        from home.
      </NotFoundState>
    </PlainFrame>
  );
}
