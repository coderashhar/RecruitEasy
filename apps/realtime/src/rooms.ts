import * as Y from "yjs";
import { prisma } from "@interviewhub/db";
import { DEFAULT_LANGUAGE } from "@interviewhub/types";

const SNAPSHOT_DEBOUNCE_MS = 10_000;

interface Room {
  doc: Y.Doc;
  connections: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

// Keyed by the in-flight hydration promise, not the resolved Room: two sockets
// joining the same interview in the same tick must await one shared Y.Doc
// rather than each racing to create their own.
const rooms = new Map<string, Promise<Room>>();

async function loadSnapshot(interviewId: string): Promise<Uint8Array | null> {
  const existing = await prisma.codeDocument.findUnique({ where: { interviewId } });
  return existing ? new Uint8Array(existing.snapshot) : null;
}

async function persistSnapshot(interviewId: string, doc: Y.Doc): Promise<void> {
  const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));
  const finalCode = doc.getText("code").toString();
  const language = (doc.getMap("meta").get("language") as string | undefined) ?? DEFAULT_LANGUAGE;

  await prisma.codeDocument.upsert({
    where: { interviewId },
    create: { interviewId, language, snapshot, finalCode },
    update: { snapshot, finalCode, language },
  });
}

function scheduleSave(interviewId: string, room: Room): void {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    persistSnapshot(interviewId, room.doc).catch((err) => {
      console.error(`[rooms] snapshot save failed for ${interviewId}`, err);
    });
  }, SNAPSHOT_DEBOUNCE_MS);
}

/** Get (or lazily create + hydrate) the in-memory Y.Doc for an interview room. */
export function getRoom(interviewId: string): Promise<Room> {
  const existing = rooms.get(interviewId);
  if (existing) return existing;

  const pending = (async (): Promise<Room> => {
    const doc = new Y.Doc();
    const snapshot = await loadSnapshot(interviewId);
    if (snapshot) Y.applyUpdate(doc, snapshot);
    return { doc, connections: 0, saveTimer: null };
  })();

  // Published before the first await inside the IIFE resolves, so a concurrent
  // caller finds it instead of starting a second hydration.
  rooms.set(interviewId, pending);

  // A failed hydration must not stay cached — the next join should retry
  // rather than inherit a permanently rejected promise.
  pending.catch(() => {
    if (rooms.get(interviewId) === pending) rooms.delete(interviewId);
  });

  return pending;
}

export function onJoin(interviewId: string, room: Room): void {
  room.connections += 1;
}

/** Flushes and evicts the room once the last participant disconnects. */
export function onLeave(interviewId: string, room: Room): void {
  room.connections -= 1;
  if (room.connections > 0) return;

  if (room.saveTimer) clearTimeout(room.saveTimer);
  persistSnapshot(interviewId, room.doc)
    .catch((err) => console.error(`[rooms] final snapshot save failed for ${interviewId}`, err))
    .finally(() => {
      // Someone may have rejoined while the final save was in flight. They hold
      // this same Room, so evicting it now would strand them on a doc nothing
      // else syncs to.
      if (room.connections === 0) rooms.delete(interviewId);
    });
}

export function applyRemoteUpdate(interviewId: string, room: Room, update: Uint8Array): void {
  Y.applyUpdate(room.doc, update, "remote");
  scheduleSave(interviewId, room);
}

export function encodeState(room: Room): Uint8Array {
  return Y.encodeStateAsUpdate(room.doc);
}
