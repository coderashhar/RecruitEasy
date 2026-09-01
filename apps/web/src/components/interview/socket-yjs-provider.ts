import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

// Tags updates that arrived FROM the socket. Without this, applying a remote
// update below would immediately re-fire the doc's own "update" event, which
// would re-emit it back over the socket, which the server rebroadcasts to
// every peer including us — every keystroke would ping-pong forever.
const REMOTE_ORIGIN = "socket-yjs-remote";

export interface SocketYjsProviderOptions {
  url: string;
  token: string;
}

/**
 * Bridges a Y.Doc (+ Awareness) to apps/realtime's socket.io events.
 *
 * Not y-websocket: the server speaks its own small event set — doc:sync
 * (initial hydration), doc:update, awareness:update — not the y-websocket
 * wire protocol (see apps/realtime/src/index.ts), so that provider doesn't
 * apply here and this one mirrors the server's events directly.
 *
 * Also exposes the raw `socket`, because interview-room.tsx needs the same
 * connection for chat, presence, and integrity-signal events that have
 * nothing to do with Yjs — one socket per room, not one per concern.
 */
export class SocketYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly socket: Socket;
  private destroyed = false;

  constructor({ url, token }: SocketYjsProviderOptions) {
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.socket = io(url, {
      auth: { token },
      transports: ["websocket"],
    });

    this.doc.on("update", this.handleLocalDocUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);

    this.socket.on("doc:sync", (state: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(state), REMOTE_ORIGIN);
    });
    this.socket.on("doc:update", (update: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), REMOTE_ORIGIN);
    });
    this.socket.on("awareness:update", (update: ArrayBuffer) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(update), REMOTE_ORIGIN);
    });
  }

  private handleLocalDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN || this.destroyed) return;
    this.socket.emit("doc:update", update);
  };

  private handleLocalAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === REMOTE_ORIGIN || this.destroyed) return;
    const changedClients = added.concat(updated, removed);
    this.socket.emit(
      "awareness:update",
      encodeAwarenessUpdate(this.awareness, changedClients),
    );
  };

  /** Full teardown: awareness cleared so peers see this client leave immediately. */
  destroy(): void {
    this.destroyed = true;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "provider destroy");
    this.doc.off("update", this.handleLocalDocUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.socket.disconnect();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
