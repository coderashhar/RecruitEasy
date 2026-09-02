"use client";

import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import type { SocketYjsProvider } from "./socket-yjs-provider";

export interface CodeEditorProps {
  provider: SocketYjsProvider;
  language: string;
}

/**
 * Monaco wired to the shared Y.Doc via y-monaco's MonacoBinding, which does
 * the actual two-way sync between the editor model and `doc.getText("code")`
 * — this component's only job is to create that binding once the editor
 * instance exists, and tear it down on unmount.
 *
 * The "code" text-key name isn't arbitrary: apps/realtime/src/rooms.ts's
 * persistSnapshot() reads `doc.getText("code")` when it saves CodeDocument —
 * a different key here would mean every session persists as empty.
 */
export function CodeEditor({ provider, language }: CodeEditorProps) {
  const bindingRef = useRef<MonacoBinding | null>(null);

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

  // Not tied to `provider` in the dependency array: this component only ever
  // mounts once per provider instance (interview-room.tsx keys the whole
  // subtree on it), and the binding is created from handleMount, not here.
  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, []);

  return (
    <Editor
      height="60vh"
      language={language}
      theme="vs-dark"
      onMount={handleMount}
      options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 14 }}
    />
  );
}
