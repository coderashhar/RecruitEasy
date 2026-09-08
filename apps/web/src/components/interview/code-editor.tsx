"use client";

import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import type { SocketYjsProvider } from "./socket-yjs-provider";

// Without this, @monaco-editor/react fetches its own copy of Monaco from a
// CDN through an AMD loader, while y-monaco binds against the copy webpack
// bundled — two Monacos in one page, which the browser reports as "Can only
// have one anonymous define call per script file". The binding would then be
// holding a different module instance than the editor it is meant to drive.
//
// Pointing the loader at the bundled package makes them the same instance,
// and removes the CDN round-trip (so the editor also works offline).
loader.config({ monaco });

export interface CodeEditorProps {
  provider: SocketYjsProvider;
  language: string;
}

interface RemotePeer {
  clientId: number;
  name: string;
  color: string;
}

/** Escapes a name for use inside a CSS `content: "..."` declaration. */
function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * y-monaco decorates remote selections with the classes
 * `yRemoteSelection-<clientID>` and `yRemoteSelectionHead-<clientID>` — and
 * ships no CSS for them whatsoever. Without these rules the decorations are
 * created and attached on every keystroke but render as nothing, which is
 * exactly what "live cursors don't work" looked like: the sync was fine, the
 * carets were simply invisible.
 *
 * The rules have to be generated per client because the colour lives in
 * awareness, not in a stylesheet, and the caret's label is the peer's name.
 */
function peerStyles(peers: RemotePeer[]): string {
  return peers
    .map(
      ({ clientId, name, color }) => `
.yRemoteSelection-${clientId} {
  background-color: ${color};
  opacity: 0.28;
}
.yRemoteSelectionHead-${clientId} {
  position: absolute;
  border-left: 2px solid ${color};
  height: 100%;
  box-sizing: border-box;
}
.yRemoteSelectionHead-${clientId}::after {
  content: "${cssString(name)}";
  position: absolute;
  top: -1.4em;
  left: -2px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4em;
  white-space: nowrap;
  background-color: ${color};
  color: #0b0b0b;
  pointer-events: none;
}`,
    )
    .join("\n");
}

/**
 * Monaco wired to the shared Y.Doc via y-monaco's MonacoBinding, which does
 * the actual two-way sync between the editor model and `doc.getText("code")`
 * — this component creates that binding once the editor instance exists, and
 * supplies the remote-caret CSS the binding assumes someone else provides.
 *
 * The "code" text-key name isn't arbitrary: apps/realtime/src/rooms.ts's
 * persistSnapshot() reads `doc.getText("code")` when it saves CodeDocument —
 * a different key here would mean every session persists as empty.
 */
export function CodeEditor({ provider, language }: CodeEditorProps) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);

  const handleMount: OnMount = (editor) => {
    const model = editor.getModel();
    if (!model) return;

    bindingRef.current = new MonacoBinding(
      provider.doc.getText("code"),
      model,
      new Set([editor]),
      provider.awareness,
    );
  };

  useEffect(() => {
    const { awareness, doc } = provider;

    const readPeers = () => {
      const next: RemotePeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID) return; // your own caret is the real one
        const user = (state as { user?: { name?: string; color?: string } }).user;
        if (!user?.name || !user.color) return;
        next.push({ clientId, name: user.name, color: user.color });
      });
      setPeers(next);
    };

    readPeers();
    awareness.on("change", readPeers);
    return () => {
      awareness.off("change", readPeers);
    };
  }, [provider]);

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, []);

  return (
    <>
      <style>{peerStyles(peers)}</style>
      <Editor
        // 100% of the pane, not a viewport fraction. `60vh` measures against
        // the window no matter what the parent is doing, so it could never
        // cooperate with the surrounding flex layout — the pane and the
        // editor would each pick a different height.
        height="100%"
        language={language}
        theme="vs-dark"
        onMount={handleMount}
        options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 14 }}
      />
    </>
  );
}
