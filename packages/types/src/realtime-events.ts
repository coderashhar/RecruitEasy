import { z } from "zod";

// Socket.io event contracts for the editor/presence/chat channel.
// Video (LiveKit) events are out of scope here — see ADR-002.

export const joinRoomSchema = z.object({
  interviewId: z.string().min(1),
  token: z.string().min(1),
});

export const chatMessageSchema = z.object({
  interviewId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

export const integritySignalSchema = z.object({
  interviewId: z.string().min(1),
  type: z.enum(["TAB_BLUR", "PASTE", "FULLSCREEN_EXIT"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const executionBroadcastSchema = z.object({
  interviewId: z.string().min(1),
  executionId: z.string().min(1),
});
