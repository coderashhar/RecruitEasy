import "server-only";

import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  WebhookReceiver,
  type EgressInfo,
} from "livekit-server-sdk";
import { prisma, type Recording } from "@interviewhub/db";
import type { RecordingRoomState } from "@interviewhub/types";
import { authorizeInterviewAccess } from "./interview-access";
import { isLiveKitConfigured } from "./livekit-token";
import { broadcastToRoom } from "./realtime-broadcast";
import { getSignedDownloadUrl, r2UploadTarget } from "./storage";

// Interview recording through LiveKit Egress, uploaded straight to R2.
//
// This runs on LiveKit Cloud's free Build plan: 60 transcode minutes a month
// shared by every recording (about one recorded hour), 2 recordings at once,
// 3 hours per file, and a hard stop — requests fail — once a quota is used.
// So recording is always an explicit choice by the interviewer, is stopped
// automatically when the interview is closed out, and every failure is
// reported in words rather than as a spinner that never ends.

export class RecordingError extends Error {}

/** Recording needs video (LiveKit) and somewhere to put the file (R2). */
export function isRecordingConfigured(): boolean {
  return isLiveKitConfigured() && r2UploadTarget() !== null;
}

function egressClient(): EgressClient {
  // The API speaks HTTPS on the same host the browser reaches over WSS.
  const host = process.env.NEXT_PUBLIC_LIVEKIT_URL!.replace(/^ws(s?):\/\//, "http$1://");
  return new EgressClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

/** How a stored recording shows in the room. */
export function roomStateFor(recording: Pick<Recording, "status"> | null): RecordingRoomState {
  switch (recording?.status) {
    case "PENDING":
      return "recording";
    case "PROCESSING":
      return "processing";
    case "READY":
      return "ready";
    case "FAILED":
      return "failed";
    // Deleted under the retention policy: nothing to show in a room.
    case "EXPIRED":
    default:
      return "idle";
  }
}

/** The room's recording state on page load. Caller has already authorized the room. */
export async function getRoomRecordingState(interviewId: string): Promise<RecordingRoomState> {
  const recording = await prisma.recording.findUnique({ where: { interviewId }, select: { status: true } });
  return roomStateFor(recording);
}

/**
 * Turns a LiveKit API failure into something an interviewer can act on. The
 * Twirp error codes are LiveKit's; anything unrecognised gets a generic
 * message and the original is logged.
 */
export function describeStartFailure(err: unknown): string {
  const { code, status, message } = (err ?? {}) as { code?: string; status?: number; message?: string };
  const text = (message ?? "").toLowerCase();

  if (code === "resource_exhausted" || status === 429 || text.includes("limit") || text.includes("quota")) {
    return "LiveKit's recording limit is used up — the free plan allows about an hour of recording a month, and two recordings at once. Try again later, or next month.";
  }
  if (code === "not_found" || status === 404 || (text.includes("room") && text.includes("not"))) {
    return "There's no call to record yet. Join the video call first, then start recording.";
  }
  if (code === "permission_denied" || code === "unauthenticated" || status === 401 || status === 403) {
    return "LiveKit refused the recording request. Check that the LiveKit API key allows recording (egress).";
  }
  return "Recording couldn't start. Try again in a moment.";
}

async function loadForInterviewer(userId: string, interviewId: string) {
  const access = await authorizeInterviewAccess(interviewId, userId);
  // Recording is the interviewer's call, not the candidate's or an observer's.
  if (!access || access.participantRole !== "INTERVIEWER") {
    throw new RecordingError("Only this interview's interviewer can record it.");
  }
  return access.interview;
}

export async function startRecording(userId: string, interviewId: string): Promise<RecordingRoomState> {
  if (!isRecordingConfigured()) {
    throw new RecordingError("Recording isn't set up: it needs both LiveKit and R2 configured.");
  }

  const interview = await loadForInterviewer(userId, interviewId);
  if (interview.status !== "SCHEDULED" && interview.status !== "IN_PROGRESS") {
    throw new RecordingError(`This interview is ${interview.status.toLowerCase()} and can't be recorded.`);
  }

  const existing = await prisma.recording.findUnique({ where: { interviewId } });
  if (existing?.status === "PENDING" || existing?.status === "PROCESSING") {
    throw new RecordingError("This interview is already being recorded.");
  }
  if (existing?.status === "READY") {
    throw new RecordingError("This interview already has a recording.");
  }

  const target = r2UploadTarget()!;
  const fileKey = `recordings/${interviewId}/${Date.now()}.mp4`;

  let egress: EgressInfo;
  try {
    egress = await egressClient().startRoomCompositeEgress(
      interview.roomName,
      new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: fileKey,
        output: {
          case: "s3",
          // R2 only serves path-style URLs for this endpoint.
          value: new S3Upload({ ...target, forcePathStyle: true }),
        },
      }),
      { layout: "speaker" },
    );
  } catch (err) {
    console.error(`[recording] start failed for interview ${interviewId}`, err);
    throw new RecordingError(describeStartFailure(err));
  }

  const orgId = await orgIdForInterview(interviewId);
  await prisma.$transaction(async (tx) => {
    // Replaces a FAILED attempt, if any: one recording per interview.
    await tx.recording.upsert({
      where: { interviewId },
      create: { interviewId, egressId: egress.egressId, fileKey, status: "PENDING" },
      update: { egressId: egress.egressId, fileKey, status: "PENDING", error: null, durationSec: null },
    });
    if (orgId) {
      await tx.auditLog.create({
        data: { orgId, actorId: userId, action: "recording.started", target: interviewId, meta: { egressId: egress.egressId } },
      });
    }
  });

  await broadcastToRoom({ type: "recording", interviewId, state: "recording" });
  return "recording";
}

export async function stopRecording(userId: string, interviewId: string): Promise<RecordingRoomState> {
  await loadForInterviewer(userId, interviewId);
  const stopped = await stopActiveRecording(interviewId, userId);
  if (!stopped) throw new RecordingError("Nothing is being recorded.");
  return "processing";
}

/**
 * Stops the interview's recording if one is running. Also called with no
 * actor when an interview is completed or cancelled, so a forgotten recording
 * doesn't keep spending the month's minutes on an empty room.
 */
export async function stopActiveRecording(interviewId: string, actorId: string | null): Promise<boolean> {
  const recording = await prisma.recording.findUnique({ where: { interviewId } });
  if (recording?.status !== "PENDING") return false;
  if (!isRecordingConfigured()) return false;

  try {
    await egressClient().stopEgress(recording.egressId);
  } catch (err) {
    // Most often it has already ended on its own (the room emptied, or a
    // limit was hit) and its webhook will settle the row. Log and carry on.
    console.error(`[recording] stop failed for egress ${recording.egressId}`, err);
  }

  // Only from PENDING: a webhook that already marked it READY or FAILED wins.
  const { count } = await prisma.recording.updateMany({
    where: { id: recording.id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });

  const orgId = await orgIdForInterview(interviewId);
  if (orgId) {
    await prisma.auditLog.create({
      data: { orgId, actorId, action: "recording.stopped", target: interviewId, meta: { automatic: actorId === null } },
    });
  }

  if (count === 1) {
    await broadcastToRoom({ type: "recording", interviewId, state: "processing" });
  }
  return true;
}

async function orgIdForInterview(interviewId: string): Promise<string | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { application: { select: { job: { select: { orgId: true } } } } },
  });
  return interview?.application.job.orgId ?? null;
}

const FAILURE_MESSAGE: Partial<Record<EgressStatus, string>> = {
  [EgressStatus.EGRESS_FAILED]: "LiveKit couldn't produce the recording.",
  [EgressStatus.EGRESS_ABORTED]: "The recording was aborted before it finished.",
  [EgressStatus.EGRESS_LIMIT_REACHED]:
    "LiveKit's recording limit was reached (the free plan allows about an hour a month, and 3 hours per file).",
};

/**
 * Applies one LiveKit webhook to its recording. The request must already be
 * verified — see verifyLiveKitWebhook. Idempotent: LiveKit retries webhooks,
 * and a repeat of an event already applied changes nothing.
 */
export async function applyEgressEvent(event: string, info: EgressInfo): Promise<void> {
  if (event !== "egress_ended") return; // started/updated add nothing the row doesn't already say

  const recording = await prisma.recording.findUnique({ where: { egressId: info.egressId } });
  if (!recording || recording.status === "READY" || recording.status === "FAILED") return;

  const file = info.fileResults[0];
  // A limit can cut a recording short and still leave a usable file.
  const hasFile = Boolean(file && file.size > BigInt(0));
  const succeeded =
    info.status === EgressStatus.EGRESS_COMPLETE ||
    (info.status === EgressStatus.EGRESS_LIMIT_REACHED && hasFile);

  if (succeeded && hasFile) {
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: "READY",
        // Egress reports duration in nanoseconds.
        durationSec: file ? Math.round(Number(file.duration) / 1e9) : null,
        error: info.status === EgressStatus.EGRESS_LIMIT_REACHED ? FAILURE_MESSAGE[info.status] : null,
      },
    });
    await broadcastToRoom({ type: "recording", interviewId: recording.interviewId, state: "ready" });
    return;
  }

  const message = FAILURE_MESSAGE[info.status] ?? (info.error || "The recording failed.");
  await prisma.recording.update({
    where: { id: recording.id },
    data: { status: "FAILED", error: message },
  });
  await broadcastToRoom({ type: "recording", interviewId: recording.interviewId, state: "failed", message });
}

/** Verifies a LiveKit webhook's signature and parses it. Throws if it isn't genuine. */
export async function verifyLiveKitWebhook(body: string, authorization: string | null) {
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!key || !secret || !authorization) throw new Error("LiveKit webhook can't be verified.");
  return new WebhookReceiver(key, secret).receive(body, authorization);
}

/**
 * A short-lived link to an interview's finished recording, for someone in the
 * interview's org. Null when there's nothing ready to play.
 */
export async function getRecordingForReview(orgId: string, interviewId: string) {
  const recording = await prisma.recording.findFirst({
    where: { interviewId, interview: { application: { job: { orgId } } } },
  });
  if (!recording) return null;

  const playbackUrl =
    recording.status === "READY" && recording.fileKey
      ? await getSignedDownloadUrl(recording.fileKey, 15 * 60)
      : null;

  return { status: recording.status, durationSec: recording.durationSec, error: recording.error, playbackUrl };
}
