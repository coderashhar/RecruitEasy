"use client";

import { useState, type ComponentProps } from "react";
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
   * True once the editor is hidden and the call owns the whole room. Drives
   * both sizing and layout: filling the available height, and switching from
   * separate stacked tiles to a focused speaker with a corner self-view.
   */
  fill?: boolean;
}

// Plain Track.Source[] (not the `{ source, withPlaceholder }` object form) so
// this yields real published tracks rather than placeholders for participants
// who haven't published anything.
const TRACK_SOURCES = [Track.Source.Camera, Track.Source.ScreenShare];

// Derived from VideoTrack's own prop rather than from useTracks' return: that
// return type is generic, and reading it back resolves the parameter to its
// constraint (which includes placeholders) rather than to what this call
// actually produces. This is precisely "what VideoTrack will render".
type TrackRef = NonNullable<ComponentProps<typeof VideoTrack>["trackRef"]>;

function tileKey(track: TrackRef): string {
  return `${track.participant.identity}:${track.source}`;
}

function Tile({ track, label }: { track: TrackRef; label: string }) {
  // A shared screen has to be shown whole — cropping it would hide the very
  // thing being discussed. Faces are better filling their tile than
  // letterboxed inside it, so they crop instead.
  const isScreenShare = track.source === Track.Source.ScreenShare;

  return (
    <div className="relative min-h-0 overflow-hidden rounded-md bg-black">
      <VideoTrack
        trackRef={track}
        className={`h-full w-full ${isScreenShare ? "object-contain" : "object-cover"}`}
      />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] leading-none text-white">
        {label}
      </span>
    </div>
  );
}

/**
 * Two arrangements, because the same one doesn't work in both places.
 *
 * Alongside the editor the call is a ~360px rail, and a corner self-view
 * inside something that narrow overlaps the other person's face rather than
 * tucking out of the way — so everyone gets their own tile, stacked.
 *
 * With the editor hidden the call owns the screen, and that's where the
 * familiar arrangement earns its place: whoever you're talking to fills the
 * frame, your own camera sits small in the corner as a self-check.
 *
 * A screen share outranks a face for the large slot in either mode.
 */
function VideoStage({ fill }: { fill: boolean }) {
  const tracks = useTracks(TRACK_SOURCES, {
    updateOnlyOn: [RoomEvent.ActiveSpeakersChanged],
    onlySubscribed: false,
  });
  const { localParticipant } = useLocalParticipant();

  const labelFor = (track: TrackRef) => {
    const name = track.participant.name || track.participant.identity;
    const isLocal = track.participant.identity === localParticipant.identity;
    if (track.source === Track.Source.ScreenShare) return `${name} — screen`;
    return isLocal ? `${name} (you)` : name;
  };

  const screenShare = tracks.find((track) => track.source === Track.Source.ScreenShare);
  const localCamera = tracks.find(
    (track) =>
      track.source === Track.Source.Camera &&
      track.participant.identity === localParticipant.identity,
  );
  const remoteCameras = tracks.filter(
    (track) =>
      track.source === Track.Source.Camera &&
      track.participant.identity !== localParticipant.identity,
  );

  if (tracks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/60">
        Waiting for video…
      </div>
    );
  }

  if (!fill) {
    // Screen share first, then whoever else is here, then you — the order
    // you'd want if the rail runs out of room.
    const stacked = [screenShare, ...remoteCameras, localCamera].filter(
      (track): track is TrackRef => Boolean(track),
    );

    return (
      <div className="grid h-full auto-rows-fr gap-2 p-2">
        {stacked.map((track) => (
          <Tile key={tileKey(track)} track={track} label={labelFor(track)} />
        ))}
      </div>
    );
  }

  // Before anyone else joins, your own camera takes the large slot — an empty
  // frame would read as broken rather than as waiting.
  const main = screenShare ?? remoteCameras[0] ?? localCamera;
  const showSelfView = Boolean(localCamera) && localCamera !== main;

  return (
    <div className="relative h-full w-full bg-black">
      {main && <Tile track={main} label={labelFor(main)} />}
      {showSelfView && localCamera && (
        <div className="absolute right-4 bottom-4 aspect-video w-44 overflow-hidden rounded-lg border-2 border-white/70 shadow-xl md:w-56">
          <Tile track={localCamera} label={labelFor(localCamera)} />
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

  // Filling the room when the editor is hidden, a fixed rail height when it
  // isn't — and the same height in both the joined and not-joined states, so
  // joining doesn't make everything below it jump.
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
      className={`flex ${sizeClassName} flex-col overflow-hidden rounded-lg border bg-black`}
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
          <VideoStage fill={fill} />
        </div>
        {/* Renders remote audio; without it participants are silent. */}
        <RoomAudioRenderer />
        <ControlBar variation="minimal" />
      </LiveKitRoom>
    </div>
  );
}
