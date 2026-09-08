import "server-only";

import { AccessToken } from "livekit-server-sdk";

/**
 * Video is optional infrastructure, unlike the realtime editor service.
 *
 * A contributor cloning this repo has Clerk and Neon to set up before anything
 * works at all; requiring a LiveKit account on top of that just to open an
 * interview room would be a poor trade. So the room degrades to
 * editor-and-chat when these are unset rather than failing to render, and
 * `npm run build` does not depend on anyone holding LiveKit credentials.
 */
export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY &&
      process.env.LIVEKIT_API_SECRET &&
      process.env.NEXT_PUBLIC_LIVEKIT_URL,
  );
}

export interface MintVideoTokenInput {
  /**
   * The LiveKit room to join. This is `Interview.roomName` — already unique
   * per interview in the schema, and generated as `interview_<uuid>` by
   * scheduleInterviewForOrg precisely so it could serve as an external room
   * identifier without leaking the interview's database id.
   */
  roomName: string;
  userId: string;
  displayName: string;
  /**
   * Sized by the caller from the interview's own duration, for the same
   * reason the realtime join token is: there is no refresh endpoint, so a
   * token that expires mid-interview drops someone out of the call with no
   * way back in short of a reload.
   */
  expiresInSeconds: number;
}

/**
 * Mints a LiveKit access token for one participant of one interview.
 *
 * Scoped to a single room: `roomJoin` plus an explicit `room` means a token
 * minted for one interview cannot be replayed against another, which matters
 * because the same authorization decision (are you a participant here?) is
 * made once, server-side, in authorizeInterviewAccess — there is no
 * client-callable endpoint that will mint one of these on request.
 */
export async function mintVideoToken({
  roomName,
  userId,
  displayName,
  expiresInSeconds,
}: MintVideoTokenInput): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — cannot mint a video token.");
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: displayName,
    ttl: expiresInSeconds,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    // Screen sharing is a published track like any other, so this is what
    // FR-1.2 actually needs; nothing further is required server-side.
    canPublishData: true,
  });

  return token.toJwt();
}
