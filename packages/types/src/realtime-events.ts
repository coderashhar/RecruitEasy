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

/** Server-to-client shape of one chat message, live (`chat:message`) or replayed (`chat:history`). */
export interface ChatMessageEvent {
  id: string;
  userId: string;
  body: string;
  /** Epoch milliseconds, from the row's createdAt. */
  at: number;
}

export const integritySignalSchema = z.object({
  interviewId: z.string().min(1),
  type: z.enum(["TAB_BLUR", "PASTE", "FULLSCREEN_EXIT"]),
  // Strict and specific, not an open record: this is stored verbatim, and the
  // candidate is told a paste's length is the only detail kept. An open
  // record would let a client store anything, including the pasted text.
  payload: z
    .object({ length: z.number().int().nonnegative() })
    .strict()
    .optional(),
});

/** Server-to-client: relayed to the other people in the room as it happens. */
export interface IntegritySignalEvent {
  userId: string;
  type: z.infer<typeof integritySignalSchema>["type"];
  payload?: z.infer<typeof integritySignalSchema>["payload"];
}

export const executionBroadcastSchema = z.object({
  interviewId: z.string().min(1),
  executionId: z.string().min(1),
});
