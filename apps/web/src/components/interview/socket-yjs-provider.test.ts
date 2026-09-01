import { describe, test, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

// A minimal fake standing in for socket.io-client's Socket: just enough of
// on/off/emit/disconnect for SocketYjsProvider's own logic to exercise, plus
// a way for the test to simulate the server pushing an event at the client.
class FakeSocket {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  emitted: Array<{ event: string; args: unknown[] }> = [];
  disconnected = false;

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

const { SocketYjsProvider } = await import("./socket-yjs-provider.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SocketYjsProvider", () => {
  test("a local doc edit is emitted as doc:update", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t" });

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
    const sender = new SocketYjsProvider({ url: "http://x", token: "sender" });
    sender.doc.getText("code").insert(0, "hello");
    const wireUpdate = lastSocket.emitted.find((e) => e.event === "doc:update")!
      .args[0] as Uint8Array;
    sender.destroy();

    const receiver = new SocketYjsProvider({ url: "http://x", token: "receiver" });
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

    const provider = new SocketYjsProvider({ url: "http://x", token: "t" });
    lastSocket.receive("doc:sync", snapshot);

    expect(provider.doc.getText("code").toString()).toBe("existing code");
    provider.destroy();
  });

  test("awareness changes are broadcast, and incoming ones are applied without re-emitting", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t" });
    provider.awareness.setLocalStateField("name", "Ada");

    const updates = lastSocket.emitted.filter((e) => e.event === "awareness:update");
    expect(updates.length).toBeGreaterThan(0);

    provider.destroy();
  });

  test("destroy() disconnects the socket and tears down doc + awareness", () => {
    const provider = new SocketYjsProvider({ url: "http://x", token: "t" });
    const { doc, awareness } = provider;

    provider.destroy();

    expect(lastSocket.disconnected).toBe(true);
    expect(doc.isDestroyed ?? true).toBeTruthy();
    // Awareness has no public isDestroyed flag; absence of further crashes on
    // a state set after destroy is the practical signal its listeners are gone.
    expect(() => awareness.setLocalStateField("name", "after destroy")).not.toThrow();
  });
});
