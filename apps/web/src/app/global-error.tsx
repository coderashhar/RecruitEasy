"use client";

import "./globals.css";

/**
 * The last resort: an error in the root layout itself, which replaces
 * `<html>` and `<body>` — so no fonts, no providers, no shell. Kept plain and
 * self-contained on purpose; anything imported here could be the thing that
 * just failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-6">
          <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            InterviewHub · something went wrong
          </div>
          <h1 className="mt-3 text-[28px] leading-tight font-semibold tracking-[-0.03em]">
            The app failed to load
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
            This one is on us, not on anything you did. Reloading usually clears it.
          </p>
          <div className="mt-7">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center bg-foreground px-4 text-sm font-semibold text-background transition-transform duration-150 ease-out active:scale-[0.98]"
            >
              Reload the app
            </button>
          </div>
          {error.digest && (
            <p className="mt-7 border-t border-hairline pt-3.5 font-mono text-[11.5px] text-muted-foreground">
              error digest {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
