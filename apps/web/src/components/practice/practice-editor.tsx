"use client";

import * as monaco from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";

// The bundled Monaco rather than @monaco-editor/react's CDN copy — see
// code-editor.tsx for why two copies in one app break.
loader.config({ monaco });

export interface PracticeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

/** A plain, single-person Monaco — no Yjs, no remote cursors. */
export function PracticeEditor({ value, language, onChange }: PracticeEditorProps) {
  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(next) => onChange(next ?? "")}
      options={{ automaticLayout: true, minimap: { enabled: false }, fontSize: 14, tabSize: 4 }}
    />
  );
}
