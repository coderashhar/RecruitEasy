import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Server, type Socket } from "socket.io";
import {
  chatMessageSchema,
  integritySignalSchema,
  executionBroadcastSchema,
} from "@interviewhub/types";
import { prisma, Prisma } from "@interviewhub/db";
import { verifyInterviewToken } from "./auth.js";
import { getRoom, onJoin, onLeave, applyRemoteUpdate, encodeState } from "./rooms.js";

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

/** Constant-time compare, and never true for a missing or malformed header. */
function isValidInternalSecret(header: string | string[] | undefined): boolean {
  if (typeof header !== "string") return false;

  const provided = Buffer.from(header);
  if (provided.length !== INTERNAL_SECRET_BYTES.length) return false;

  return timingSafeEqual(provided, INTERNAL_SECRET_BYTES);
}

const httpServer = createServer(async (req, res) => {
  // Minimal server-to-server hook: the web app's execute route calls this
  // after persisting an Execution, so every socket in the room learns about
  // it without the web app holding a socket connection of its own (ADR-004).
  if (req.method === "POST" && req.url === "/internal/broadcast") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);

    try {
      if (!isValidInternalSecret(req.headers["x-internal-secret"])) {
        res.writeHead(401).end();
        return;
      }
      const body = executionBroadcastSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
      io.to(body.interviewId).emit("execution:result", { executionId: body.executionId });
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

  socket.on("chat:message", (raw: unknown) => {
    const parsed = chatMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    io.to(interviewId).emit("chat:message", {
      userId,
      body: parsed.data.body,
      at: Date.now(),
    });
  });

  // Advisory only — never blocks or auto-flags a candidate (see PRD risk
  // mitigation on anti-cheat, and IntegritySignal in the data model).
  socket.on("integrity:signal", (raw: unknown) => {
    const parsed = integritySignalSchema.safeParse(raw);
    if (!parsed.success) return;

    prisma.integritySignal
      .create({
        data: {
          interviewId,
          type: parsed.data.type,
          payload: parsed.data.payload as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((err) => console.error("[integrity] persist failed", err));

    socket.to(interviewId).emit("integrity:signal", { userId, type: parsed.data.type });
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
