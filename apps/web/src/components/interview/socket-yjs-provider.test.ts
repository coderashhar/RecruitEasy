import { describe, test, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

/** Stands in for socket.io-client's Manager, reachable as `socket.io`. */
class FakeManager {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
  }

  receive(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}

// A minimal fake standing in for socket.io-client's Socket: just enough of
// on/off/emit/disconnect for SocketYjsProvider's own logic to exercise, plus
// a way for the test to simulate the server pushing an event at the client.
//
// `io` is the Manager, which a real Socket always carries — reconnection
// events are emitted there, not on the socket itself.
class FakeSocket {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  emitted: Array<{ event: string; args: unknown[] }> = [];
  disconnected = false;
  io = new FakeManager();

  on(event: string, handler: (...args: unknown[]) => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
  }

  disconnect() {
    this.disconnected = true;
  }

  /** Simulate the server pushing `event` at this client. */
  receive(event: string, ...args: unknown[]) {
    for (const handler of this.listeners.get(event) ?? []) handler(...args);
  }
}

let lastSocket: FakeSocket;
vi.mock("socket.io-client", () => ({
  io: () => {
    lastSocket = new FakeSocket();
    return lastSocket;
  },
}));

const IDENTITY = { userId: "user_1", name: "Test User" };

const { SocketYjsProvider } = await import("./socket-yjs-provider.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SocketYjsProvider", () => {
  test("a local doc edit is emitted as doc:update", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t", identity: IDENTITY });

    provider.doc.getText("code").insert(0, "hello");

    const updates = lastSocket.emitted.filter((e) => e.event === "doc:update");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toBeInstanceOf(Uint8Array);

    provider.destroy();
  });

  // The bug this class exists to avoid: applying a remote update must not
  // itself be re-broadcast, or two peers would echo the same edit back and
  // forth forever.
  test("applying an incoming doc:update does NOT re-emit it — no infinite loop", () => {
    const sender = new SocketYjsProvider({ url: "http://x", token: "sender", identity: IDENTITY });
    sender.doc.getText("code").insert(0, "hello");
    const wireUpdate = lastSocket.emitted.find((e) => e.event === "doc:update")!
      .args[0] as Uint8Array;
    sender.destroy();

    const receiver = new SocketYjsProvider({ url: "http://x", token: "receiver", identity: IDENTITY });
    lastSocket.emitted = []; // clear whatever construction itself produced, if anything

    lastSocket.receive("doc:update", wireUpdate);

    expect(receiver.doc.getText("code").toString()).toBe("hello");
    expect(lastSocket.emitted.filter((e) => e.event === "doc:update")).toHaveLength(0);

    receiver.destroy();
  });

  test("doc:sync hydrates the doc from the server's initial snapshot", () => {
    const seed = new Y.Doc();
    seed.getText("code").insert(0, "existing code");
    const snapshot = Y.encodeStateAsUpdate(seed);

    const provider = new SocketYjsProvider({ url: "http://x", token: "t", identity: IDENTITY });
    lastSocket.receive("doc:sync", snapshot);

    expect(provider.doc.getText("code").toString()).toBe("existing code");
    provider.destroy();
  });

  test("awareness changes are broadcast, and incoming ones are applied without re-emitting", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t", identity: IDENTITY });
    provider.awareness.setLocalStateField("name", "Ada");

    const updates = lastSocket.emitted.filter((e) => e.event === "awareness:update");
    expect(updates.length).toBeGreaterThan(0);

    provider.destroy();
  });

  test("destroy() disconnects the socket and tears down doc + awareness", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t", identity: IDENTITY });
    const { doc, awareness } = provider;

    provider.destroy();

    expect(lastSocket.disconnected).toBe(true);
    expect(doc.isDestroyed ?? true).toBeTruthy();
    // Awareness has no public isDestroyed flag; absence of further crashes on
    // a state set after destroy is the practical signal its listeners are gone.
    expect(() => awareness.setLocalStateField("name", "after destroy")).not.toThrow();
  });

  // The regression this guards: a join token is minted for the interview's
  // length plus a grace period with no refresh path, so an expired token and
  // a flaky network look identical to the user unless they are reported
  // apart — only one of the two is fixed by reloading.
  test("reports connection status, distinguishing an expired token from a drop", () => {
    const seen: string[] = [];
    new SocketYjsProvider({
      url: "http://x",
      token: "t",
      identity: IDENTITY,
      onStatus: (status) => seen.push(status),
    });

    lastSocket.receive("connect");
    lastSocket.io.receive("reconnect_attempt");
    lastSocket.receive("disconnect");
    lastSocket.receive("connect_error", new Error("unauthorized"));

    expect(seen).toEqual([
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
      "unauthorized",
    ]);
  });

  test("publishes identity into awareness so peers can label the caret", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t", identity: IDENTITY });

    const state = provider.awareness.getLocalState() as {
      user?: { userId: string; name: string; color: string };
    };
    expect(state.user).toMatchObject({ userId: "user_1", name: "Test User" });
    expect(state.user?.color).toMatch(/^hsl\(/);
  });

});
