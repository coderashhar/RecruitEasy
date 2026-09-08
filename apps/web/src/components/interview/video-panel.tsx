"use client";

import { useState } from "react";
import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { LiveKitRoom } from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import "@livekit/components-styles";

export interface VideoPanelProps {
  serverUrl: string;
  token: string;
}

/**
 * Tiles for every published camera and screen share in the room.
 *
 * Screen shares are included in the same grid rather than given a separate
 * surface: during a technical interview the shared screen is usually the
 * subject of the conversation, and splitting it out would leave whichever
 * pane it wasn't in mostly empty.
 */
function VideoTiles() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );

  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

/**
 * The call half of the interview room.
 *
 * Deliberately does not connect on mount. Joining publishes camera and
 * microphone, and a page that grabs both the moment it loads is hostile —
 * a candidate opening the room early to check it works should not find
 * themselves broadcasting. The browser's own permission prompt is also far
 * less alarming when it follows a button the person just pressed.
 */
export function VideoPanel({ serverUrl, token }: VideoPanelProps) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!joined) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Your camera and microphone stay off until you join.
        </p>
        <button
          type="button"
          onClick={() => setJoined(true)}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Join call
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border" data-lk-theme="default">
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect
        video
        audio
        onDisconnected={() => setJoined(false)}
        onError={(err) => {
          setError(err.message);
          setJoined(false);
        }}
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        <div className="min-h-48 flex-1">
          <VideoTiles />
        </div>
        {/* Renders remote audio; without it participants are silent. */}
        <RoomAudioRenderer />
        <ControlBar variation="minimal" />
      </LiveKitRoom>
    </div>
  );
}
