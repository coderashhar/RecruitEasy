"use client";

import { useState } from "react";
import {
  ControlBar,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import "@livekit/components-styles";

export interface VideoPanelProps {
  serverUrl: string;
  token: string;
  /**
   * True once the editor is hidden and this panel owns the whole room —
   * it then fills the available height instead of the fixed rail height
   * it uses sitting alongside the editor.
   */
  fill?: boolean;
}

/**
 * The other person large, you in the corner — the arrangement every call
 * app converges on, because your own face is a self-check, not the subject.
 * A screen share outranks a face for the large slot: during a technical
 * interview the shared screen is usually what's actually being discussed.
 *
 * Hand-rolled rather than LiveKit's FocusLayoutContainer, which puts
 * everyone-else in a carousel strip — not the corner-overlay picture-in-
 * picture look this room wants.
 */
function VideoStage() {
  // Plain Track.Source[] (not the `{ source, withPlaceholder }` object form)
  // so this returns TrackReference[], not TrackReferenceOrPlaceholder[] — the
  // type VideoTrack actually accepts. Placeholders aren't useful here anyway:
  // "nobody else has published a camera yet" is already covered below by
  // falling back to your own camera, or to the waiting message.
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    updateOnlyOn: [RoomEvent.ActiveSpeakersChanged],
    onlySubscribed: false,
  });
  const { localParticipant } = useLocalParticipant();

  const screenShare = tracks.find((track) => track.source === Track.Source.ScreenShare);
  const localCamera = tracks.find(
    (track) =>
      track.source === Track.Source.Camera &&
      track.participant.identity === localParticipant.identity,
  );
  const remoteCamera = tracks.find(
    (track) =>
      track.source === Track.Source.Camera &&
      track.participant.identity !== localParticipant.identity,
  );

  // Before anyone else has joined, your own camera takes the large slot —
  // an empty frame would read as broken rather than as "waiting".
  const main = screenShare ?? remoteCamera ?? localCamera;
  const showPip = Boolean(localCamera) && localCamera !== main;

  return (
    <div className="relative h-full w-full bg-black">
      {main ? (
        <VideoTrack trackRef={main} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/60">
          Waiting for video…
        </div>
      )}
      {showPip && localCamera && (
        <div className="absolute right-3 bottom-3 h-24 w-36 overflow-hidden rounded-md border-2 border-white/80 shadow-lg sm:h-28 sm:w-44">
          <VideoTrack trackRef={localCamera} className="h-full w-full object-cover" />
        </div>
      )}
    </div>
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
export function VideoPanel({ serverUrl, token, fill = false }: VideoPanelProps) {
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same height in both the "not joined" and connected states so joining and
  // leaving doesn't make the rail jump and shove everything below it around.
  const sizeClassName = fill ? "min-h-0 flex-1" : "h-64 shrink-0";

  if (!joined) {
    return (
      <div
        className={`flex ${sizeClassName} flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center`}
      >
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
    <div
      className={`flex ${sizeClassName} flex-col overflow-hidden rounded-lg border`}
      data-lk-theme="default"
    >
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
        style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
      >
        <div className="min-h-0 flex-1">
          <VideoStage />
        </div>
        {/* Renders remote audio; without it participants are silent. */}
        <RoomAudioRenderer />
        <ControlBar variation="minimal" />
      </LiveKitRoom>
    </div>
  );
}
