import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Server, type Socket } from "socket.io";
import {
  chatMessageSchema,
  integritySignalSchema,
  internalBroadcastSchema,
  type ChatMessageEvent,
  type IntegritySignalEvent,
} from "@interviewhub/types";
import { prisma, Prisma } from "@interviewhub/db";
import { verifyInterviewToken } from "./auth.js";
import { getRoom, onJoin, onLeave, applyRemoteUpdate, encodeState } from "./rooms.js";
import { createSocketLimit } from "./socket-limit.js";

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",");

// Fail fast rather than booting a service whose auth checks would all pass
// vacuously against an undefined secret.
const INTERNAL_SECRET = process.env.REALTIME_JWT_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error("REALTIME_JWT_SECRET is not set — refusing to start");
}

interface SocketData {
  interviewId: string;
  userId: string;
  role: "CANDIDATE" | "INTERVIEWER" | "OBSERVER";
}

const INTERNAL_SECRET_BYTES = Buffer.from(INTERNAL_SECRET);

// Replayed to every socket on join. Bounded so a very chatty interview can't
// turn every reconnect into an unbounded query and payload.
const CHAT_HISTORY_LIMIT = 200;

// Generous for a person typing, far below what a loop would send.
const CHAT_LIMIT = { count: 20, windowMs: 10_000 };

// A candidate alt-tabbing repeatedly produces a few a minute; past this it is
// a loop, and every extra row only buries the real ones for the reviewer.
const INTEGRITY_LIMIT = { count: 60, windowMs: 60_000 };

function toChatEvent(row: { id: string; userId: string; body: string; createdAt: Date }): ChatMessageEvent {
  return { id: row.id, userId: row.userId, body: row.body, at: row.createdAt.getTime() };
}

/** Constant-time compare, and never true for a missing or malformed header. */
function isValidInternalSecret(header: string | string[] | undefined): boolean {
  if (typeof header !== "string") return false;

  const provided = Buffer.from(header);
  if (provided.length !== INTERNAL_SECRET_BYTES.length) return false;

  return timingSafeEqual(provided, INTERNAL_SECRET_BYTES);
}

const httpServer = createServer(async (req, res) => {
  // Minimal server-to-server hook: the web app calls this after persisting an
  // Execution or changing a recording, so every socket in the room learns
  // about it without the web app holding a socket connection of its own
  // (ADR-004).
  if (req.method === "POST" && req.url === "/internal/broadcast") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);

    try {
      if (!isValidInternalSecret(req.headers["x-internal-secret"])) {
        res.writeHead(401).end();
        return;
      }
      const body = internalBroadcastSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
      if (body.type === "recording") {
        io.to(body.interviewId).emit("recording:state", { state: body.state, message: body.message });
      } else {
        io.to(body.interviewId).emit("execution:result", { executionId: body.executionId });
      }
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200).end("ok");
    return;
  }

  res.writeHead(404).end();
});

const io = new Server<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: { origin: CORS_ORIGIN },
  maxHttpBufferSize: 1e6, // 1MB — generous for a Yjs update, tight enough to bound abuse
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") throw new Error("missing token");

    const claims = verifyInterviewToken(token);
    socket.data.interviewId = claims.interviewId;
    socket.data.userId = claims.userId;
    socket.data.role = claims.role;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket: Socket<any, any, any, SocketData>) => {
  const { interviewId, userId, role } = socket.data;

  // Started immediately (getRoom returns a promise synchronously) but not
  // awaited here, so listener registration below happens on this same tick —
  // Socket.io does not queue events for a not-yet-registered listener, so an
  // eager client that sends doc:update before hydration finishes must not
  // find its event silently dropped.
  const roomPromise = getRoom(interviewId);
  let joined = false;

  socket.on("doc:update", async (update: Buffer) => {
    let room;
    try {
      room = await roomPromise;
    } catch {
      return; // room never hydrated; nothing to apply the update to
    }

    // A malformed frame must be dropped, not thrown — this handler is the
    // one place client input reaches Y.applyUpdate, and that throws on
    // invalid binary. Letting it escape here would crash the whole process
    // (and every other in-progress interview) over one bad frame.
    try {
      applyRemoteUpdate(interviewId, room, new Uint8Array(update));
    } catch (err) {
      console.error(`[realtime] dropped malformed doc:update for interview ${interviewId}`, err);
      return;
    }

    socket.to(interviewId).emit("doc:update", update);
  });

  // Awareness (live cursors, selections) is ephemeral — relay only, never persisted.
  socket.on("awareness:update", (update: Buffer) => {
    socket.to(interviewId).emit("awareness:update", update);
  });

  const allowChat = createSocketLimit(CHAT_LIMIT.count, CHAT_LIMIT.windowMs);

  socket.on("chat:message", async (raw: unknown) => {
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success || !allowChat()) return;

    // Persisted before it is broadcast, so the id everyone receives is the
    // row's own — which is what lets a client merge this live message with a
    // later chat:history replay without showing it twice.
    let message: ChatMessageEvent;
    try {
      const row = await prisma.chatMessage.create({
        data: { interviewId, userId, body: parsed.data.body },
      });
      message = toChatEvent(row);
    } catch (err) {
      // A database blip must not silence the room: people are mid-interview.
      // The message still goes out live; it just won't survive a reload.
      console.error(`[realtime] chat persist failed for interview ${interviewId}`, err);
      message = { id: randomUUID(), userId, body: parsed.data.body, at: Date.now() };
    }

    io.to(interviewId).emit("chat:message", message);
  });

  const allowIntegritySignal = createSocketLimit(INTEGRITY_LIMIT.count, INTEGRITY_LIMIT.windowMs);

  // Advisory only — never blocks or auto-flags a candidate (see PRD risk
  // mitigation on anti-cheat, and IntegritySignal in the data model).
  socket.on("integrity:signal", (raw: unknown) => {
    // Signals describe the candidate, so only the candidate's socket may
    // record them. The client already sends them only from that role; this
    // is the check that holds when a client doesn't — an interviewer pasting
    // a starter snippet must not land on the candidate's review page.
    if (role !== "CANDIDATE") return;

    const parsed = integritySignalSchema.safeParse(raw);
    if (!parsed.success || !allowIntegritySignal()) return;

    prisma.integritySignal
      .create({
        data: {
          interviewId,
          type: parsed.data.type,
          payload: parsed.data.payload as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((err) => console.error("[integrity] persist failed", err));

    const event: IntegritySignalEvent = {
      userId,
      type: parsed.data.type,
      payload: parsed.data.payload,
    };
    socket.to(interviewId).emit("integrity:signal", event);
  });

  socket.on("disconnecting", () => {
    // onJoin/onLeave must stay paired — calling onLeave without a matching
    // onJoin (e.g. hydration failed) would double-decrement connections and
    // could evict a room a peer is still using.
    if (!joined) return;
    roomPromise.then((room) => {
      onLeave(interviewId, room);
      socket.to(interviewId).emit("presence:leave", { userId });
    });
  });

  roomPromise
    .then(async (room) => {
      onJoin(interviewId, room);
      joined = true;
      socket.join(interviewId);

      // Hydrate the newly-joined client with the current document state.
      socket.emit("doc:sync", Buffer.from(encodeState(room)));

      // ...and with who is already here. `presence:join` below only reaches
      // the people already in the room, so without this the *newcomer* learns
      // about nobody: whoever joined second sat in an interview reporting an
      // empty room for its whole duration. Read after socket.join, so this
      // includes the newcomer itself and the client needs no special case for
      // "am I in my own list".
      const peers = await io.in(interviewId).fetchSockets();
      socket.emit(
        "presence:list",
        peers.map((peer) => ({
          userId: (peer.data as SocketData).userId,
          role: (peer.data as SocketData).role,
        })),
      );

      socket.to(interviewId).emit("presence:join", { userId, role });

      // Sent on every connection, reconnects included, so a client that
      // dropped for a minute gets back whatever was said while it was gone.
      // Its own failure is not a failed join: the editor and call still work.
      try {
        const rows = await prisma.chatMessage.findMany({
          where: { interviewId },
          orderBy: { createdAt: "desc" },
          take: CHAT_HISTORY_LIMIT,
        });
        socket.emit("chat:history", rows.reverse().map(toChatEvent));
      } catch (err) {
        console.error(`[realtime] chat history failed for interview ${interviewId}`, err);
      }
    })
    .catch((err) => {
      console.error(`[realtime] join failed for interview ${interviewId}`, err);
      socket.emit("room:error", { message: "Could not join the interview room." });
      socket.disconnect(true);
    });
});

httpServer.listen(PORT, () => {
  console.log(`[realtime] listening on :${PORT}`);
});

// Exported so integration tests can close the real server cleanly instead of
// leaking an open port/connection per test run.
export { httpServer, io };
