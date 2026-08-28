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

  // Failing to set up one socket must not take the process — and every other
  // in-progress interview — down with it.
  void (async () => {
    const room = await getRoom(interviewId);
    onJoin(interviewId, room);
    socket.join(interviewId);

    // Hydrate the newly-joined client with the current document state.
    socket.emit("doc:sync", Buffer.from(encodeState(room)));
    socket.to(interviewId).emit("presence:join", { userId, role });

    socket.on("doc:update", async (update: Buffer) => {
      applyRemoteUpdate(interviewId, room, new Uint8Array(update));
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
      onLeave(interviewId, room);
      socket.to(interviewId).emit("presence:leave", { userId });
    });
  })().catch((err) => {
    console.error(`[realtime] join failed for interview ${interviewId}`, err);
    socket.emit("room:error", { message: "Could not join the interview room." });
    socket.disconnect(true);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[realtime] listening on :${PORT}`);
});
