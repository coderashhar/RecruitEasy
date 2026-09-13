/**
 * Runs the ACTUAL realtime service (real HTTP + Socket.io server, real
 * Postgres via DATABASE_URL, real jsonwebtoken verification) against real
 * socket.io-client connections. Nothing here is mocked.
 *
 * This is the test called for in the architecture plan's Phase 0.5: prove
 * the collaborative-editor design (ADR-002/ADR-003) actually works, and
 * prove the malformed-frame crash fix holds under a real connection, not
 * just at the unit level.
 *
 * Requires a running local Postgres with DATABASE_URL set (see
 * apps/realtime/.env) — this is an integration test, not a unit test.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import * as Y from "yjs";
import { prisma } from "@interviewhub/db";

const PORT = 4477;
const SECRET = "integration-test-secret";
const URL = `http://localhost:${PORT}`;

process.env.PORT = String(PORT);
process.env.REALTIME_JWT_SECRET = SECRET;
process.env.CORS_ORIGIN = URL;

// Side-effecting import: this actually starts the server on PORT.
const { httpServer, io: serverIo } = await import("./index.js");

/**
 * How long onLeave's final save takes is a network fact, not a code fact —
 * it's an upsert against a remote Neon instance. Sleeping a fixed 200ms and
 * hoping guessed wrong often enough to fail this suite intermittently, which
 * trains you to re-run rather than read failures. Poll for the row instead.
 */
async function waitForCodeDocument(interviewId: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.codeDocument.findUnique({ where: { interviewId } });
    if (row) return row;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

function tokenFor(interviewId: string, userId: string, role: "CANDIDATE" | "INTERVIEWER") {
  return jwt.sign({ interviewId, userId, role }, SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

// A fast (warm-room) server can emit doc:sync/presence:join before the test
// gets around to attaching a listener for it — the same class of race the
// server-side fix (roomPromise + synchronous listener registration) closes
// for real clients. Buffering every event from the moment the socket is
// created removes the race from the test harness itself.
function connect(token: string): Promise<{ socket: ClientSocket; next: (event: string) => Promise<any> }> {
  const buffered = new Map<string, unknown[]>();
  const waiters = new Map<string, (value: unknown) => void>();

  return new Promise((resolve, reject) => {
    const socket = ioClient(URL, { auth: { token }, forceNew: true, transports: ["websocket"] });

    socket.onAny((event: string, payload: unknown) => {
      const waiter = waiters.get(event);
      if (waiter) {
        waiters.delete(event);
        waiter(payload);
        return;
      }
      const queue = buffered.get(event) ?? [];
      queue.push(payload);
      buffered.set(event, queue);
    });

    function next(event: string): Promise<any> {
      const queue = buffered.get(event);
      if (queue && queue.length > 0) return Promise.resolve(queue.shift());
      return new Promise((res) => waiters.set(event, res));
    }

    socket.once("connect", () => resolve({ socket, next }));
    socket.once("connect_error", reject);
  });
}

describe("realtime server (integration, real DB + real sockets)", () => {
  let orgId: string;
  let candidateId: string;
  let interviewerId: string;
  let jobId: string;
  let applicationId: string;

  // Each test gets its own interview/room — sharing one across tests would
  // let a later test's assertions see an earlier test's accumulated Y.Doc
  // state (this was caught empirically: a shared-room draft of this suite
  // had the persistence test see "still aliveprint('hello')persisted..."
  // instead of just its own edit).
  //
  // The Application is shared rather than per-interview: it's unique on
  // (jobId, candidateId), and one application legitimately has many interview
  // rounds. Only the Interview needs to be fresh for the isolation above.
  async function createInterview(): Promise<string> {
    const interview = await prisma.interview.create({
      data: {
        applicationId,
        scheduledAt: new Date(),
        roomName: `it-room-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: "IN_PROGRESS",
        participants: {
          create: [
            { userId: candidateId, role: "CANDIDATE" },
            { userId: interviewerId, role: "INTERVIEWER" },
          ],
        },
      },
    });
    return interview.id;
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "Realtime IT Org", slug: `realtime-it-${Date.now()}` },
    });
    orgId = org.id;

    const [candidate, interviewer] = await Promise.all([
      prisma.user.create({
        data: { orgId, clerkId: `it-cand-${Date.now()}`, role: "CANDIDATE", email: `cand-${Date.now()}@it.test`, name: "IT Candidate" },
      }),
      prisma.user.create({
        data: { orgId, clerkId: `it-intv-${Date.now()}`, role: "INTERVIEWER", email: `intv-${Date.now()}@it.test`, name: "IT Interviewer" },
      }),
    ]);
    candidateId = candidate.id;
    interviewerId = interviewer.id;

    const job = await prisma.job.create({
      data: { orgId, title: "IT Role", description: "test", requiredSkills: [] },
    });
    jobId = job.id;

    const application = await prisma.application.create({
      data: { jobId, candidateId, status: "INTERVIEWING" },
    });
    applicationId = application.id;
  });

  afterAll(async () => {
    // Cascades: interview -> participants, codeDocument, executions, etc.
    // application -> resumes. Then org -> users, jobs.
    await prisma.interview.deleteMany({ where: { roomName: { startsWith: "it-room-" } } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    serverIo.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  test("rejects a connection with no token", async () => {
    await expect(connect("")).rejects.toBeTruthy();
  });

  test("two real participants converge on the same document via real sockets", async () => {
    const interviewId = await createInterview();
    const a = await connect(tokenFor(interviewId, "user-a", "CANDIDATE"));
    const b = await connect(tokenFor(interviewId, "user-b", "INTERVIEWER"));
    await Promise.all([a.next("presence:join"), b.next("doc:sync")]);

    // Each side keeps its own accumulating Y.Doc — as a real editor client
    // would — and applies every update it exchanges with the other. The
    // convergence property under test is that both end up byte-identical,
    // not merely that one update round-trips (Yjs's CRDT merge order for
    // concurrent inserts is not "whoever inserts first wins position 0").
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const bReceivesA = b.next("doc:update");
    docA.getText("code").insert(0, "def solve():\n");
    a.socket.emit("doc:update", Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docB, new Uint8Array(await bReceivesA));

    const aReceivesB = a.next("doc:update");
    docB.getText("code").insert(docB.getText("code").length, "    return 42\n");
    b.socket.emit("doc:update", Y.encodeStateAsUpdate(docB));
    Y.applyUpdate(docA, new Uint8Array(await aReceivesB));

    const textA = docA.getText("code").toString();
    const textB = docB.getText("code").toString();
    expect(textA).toBe(textB);
    expect(textA).toBe("def solve():\n    return 42\n");

    a.socket.close();
    b.socket.close();
  });

  test("a malformed frame is dropped, not crashes, and the connection stays usable", async () => {
    const interviewId = await createInterview();
    const a = await connect(tokenFor(interviewId, "user-c", "CANDIDATE"));
    const b = await connect(tokenFor(interviewId, "user-d", "INTERVIEWER"));
    await Promise.all([a.next("presence:join"), b.next("doc:sync")]);

    // A garbage frame — this exact byte sequence was independently confirmed
    // (outside this test suite) to throw inside Y.applyUpdate and, before the
    // fix, crash the whole process via an unhandled rejection.
    const garbage = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x7f, 0x41, 0x42, 0x43]);

    let relayedGarbage = false;
    b.socket.once("doc:update", () => {
      relayedGarbage = true;
    });
    a.socket.emit("doc:update", garbage);

    // Give the server a moment to (not) process and (not) relay it.
    await new Promise((r) => setTimeout(r, 150));
    expect(relayedGarbage).toBe(false);

    // The server process must still be alive and the socket still usable —
    // prove it by completing a normal round trip right after the garbage frame.
    const docA = new Y.Doc();
    docA.getText("code").insert(0, "still alive");
    const goodUpdate = Y.encodeStateAsUpdate(docA);

    const relayed = b.next("doc:update");
    a.socket.emit("doc:update", goodUpdate);
    const received: Buffer = await relayed;

    const docB = new Y.Doc();
    Y.applyUpdate(docB, new Uint8Array(received));
    expect(docB.getText("code").toString()).toBe("still alive");

    a.socket.close();
    b.socket.close();
  });

  test("edits persist to Postgres and rehydrate a fresh room after everyone leaves", async () => {
    const interviewId = await createInterview();
    const a = await connect(tokenFor(interviewId, "user-e", "CANDIDATE"));
    await a.next("doc:sync");

    const doc = new Y.Doc();
    doc.getText("code").insert(0, "persisted across reconnect");
    a.socket.emit("doc:update", Y.encodeStateAsUpdate(doc));

    // Let the server apply the update before disconnecting.
    await new Promise((r) => setTimeout(r, 100));
    a.socket.close();

    // onLeave triggers an immediate final save on last-participant-disconnect
    // (see rooms.ts) — no need to wait out the 10s debounce, but the save
    // itself still has to reach Postgres.
    const row = await waitForCodeDocument(interviewId);
    expect(row).not.toBeNull();

    const persistedDoc = new Y.Doc();
    Y.applyUpdate(persistedDoc, new Uint8Array(row!.snapshot));
    expect(persistedDoc.getText("code").toString()).toBe("persisted across reconnect");
    expect(row!.finalCode).toBe("persisted across reconnect");

    // A brand-new connection (nothing left in the in-memory room map, since
    // the last participant just left) must rehydrate from that same row —
    // this is the code path a real process restart would also take.
    const b = await connect(tokenFor(interviewId, "user-f", "INTERVIEWER"));
    const synced: Buffer = await b.next("doc:sync");

    const rehydrated = new Y.Doc();
    Y.applyUpdate(rehydrated, new Uint8Array(synced));
    expect(rehydrated.getText("code").toString()).toBe("persisted across reconnect");

    b.socket.close();
  });

  // The regression this guards: presence:join only reaches sockets already in
  // the room, so before presence:list existed the *second* person to join
  // never learned the first was there — they sat in an interview that
  // reported an empty room for its whole duration, while the first person
  // saw them fine.
  test("whoever joins second is told who is already in the room", async () => {
    const interviewId = await createInterview();

    const first = await connect(tokenFor(interviewId, "user-g", "CANDIDATE"));
    const firstList: Array<{ userId: string; role: string }> = await first.next("presence:list");
    expect(firstList.map((p) => p.userId)).toEqual(["user-g"]);

    const second = await connect(tokenFor(interviewId, "user-h", "INTERVIEWER"));
    const secondList: Array<{ userId: string; role: string }> = await second.next("presence:list");

    // The whole point: the newcomer sees the incumbent, not an empty room.
    expect(secondList.map((p) => p.userId).sort()).toEqual(["user-g", "user-h"]);
    expect(secondList.find((p) => p.userId === "user-g")?.role).toBe("CANDIDATE");

    // And the incumbent still hears about the newcomer the old way.
    const joined: { userId: string; role: string } = await first.next("presence:join");
    expect(joined).toMatchObject({ userId: "user-h", role: "INTERVIEWER" });

    first.socket.close();
    second.socket.close();
  });

  // Chat used to live only in each browser's memory: a reload, or a network
  // drop long enough to reconnect, and the conversation was gone for that
  // person while the other still had it.
  test("chat is persisted and replayed to whoever (re)connects", async () => {
    const interviewId = await createInterview();

    const candidate = await connect(tokenFor(interviewId, candidateId, "CANDIDATE"));
    const interviewer = await connect(tokenFor(interviewId, interviewerId, "INTERVIEWER"));
    await Promise.all([candidate.next("chat:history"), interviewer.next("chat:history")]);

    candidate.socket.emit("chat:message", { interviewId, body: "can you hear me?" });
    const live = await interviewer.next("chat:message");
    expect(live).toMatchObject({ userId: candidateId, body: "can you hear me?" });

    // The broadcast id is the row's id — the property the client's merge of
    // live messages with a later replay depends on.
    const row = await prisma.chatMessage.findUnique({ where: { id: live.id } });
    expect(row).toMatchObject({ interviewId, userId: candidateId, body: "can you hear me?" });

    interviewer.socket.close();
    const rejoined = await connect(tokenFor(interviewId, interviewerId, "INTERVIEWER"));
    const history = await rejoined.next("chat:history");
    expect(history).toEqual([live]);

    candidate.socket.close();
    rejoined.socket.close();
  });
});
