"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { Button } from "@/components/ui/button";

/**
 * Playback links are presigned for 15 minutes. Leave the page open past that
 * and the browser fails silently — a black rectangle, no message. This says
 * what happened and refreshes the page, which mints a new link.
 */
export function RecordingPlayer({ src, durationSec }: { src: string; durationSec: number | null }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <CalloutBanner
        tone="warning"
        role="status"
        title="The playback link expired"
        action={
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            Get a new link
          </Button>
        }
      >
        Recording links last 15 minutes so they can&apos;t be forwarded outside your organisation. The file is still
        there.
      </CalloutBanner>
    );
  }

  return (
    <>
      <video
        controls
        preload="metadata"
        src={src}
        onError={() => setFailed(true)}
        className="w-full bg-black"
      />
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        {durationSec ? `${Math.floor(durationSec / 60)} min ${durationSec % 60} s` : "ready"}
      </p>
    </>
  );
}
