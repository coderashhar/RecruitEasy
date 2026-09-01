"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InterviewParticipantRole } from "@interviewhub/db";
import { SocketYjsProvider } from "./socket-yjs-provider";

// Monaco measures the DOM and touches `window` on load, so it cannot be
// prerendered on the server. Per Next's own docs, `ssr: false` is only legal
// from inside a Client Component ("not allowed... in Server Components") —
// which is why the dynamic import happens here, in this "use client" file,
// rather than in interview/[id]/page.tsx.
const CodeEditor = dynamic(() => import("./code-editor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

export interface InterviewRoomProps {
  interviewId: string;
  token: string;
  role: InterviewParticipantRole;
}

interface ChatMessage {
  userId: string;
  body: string;
  at: number;
}

interface PresenceEntry {
  userId: string;
  role: string;
}

// rooms.ts's own default when a room has no saved CodeDocument yet — matched
// here so the editor's language picker isn't lying about what a fresh room
// will actually persist as.
const DEFAULT_LANGUAGE = "javascript";

export function InterviewRoom({ interviewId, token, role }: InterviewRoomProps) {
  const [provider, setProvider] = useState<SocketYjsProvider | null>(null);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!url) {
      console.error("[interview] NEXT_PUBLIC_REALTIME_URL is not set — cannot join the room.");
      return;
    }

    const nextProvider = new SocketYjsProvider({ url, token });
    // Revealed once the socket actually connects, not the instant it's
    // constructed (connecting is inherently async) — this also keeps the
    // very first setState call inside an event callback rather than
    // synchronously in the effect body, which is what React's own
    // set-state-in-effect lint rule is steering toward: a direct
    // synchronous setState here would trigger an extra cascading render
    // on every mount for no benefit.
    nextProvider.socket.once("connect", () => setProvider(nextProvider));

    const handlePresenceJoin = (entry: PresenceEntry) =>
      setPresence((prev) => [...prev.filter((p) => p.userId !== entry.userId), entry]);
    const handlePresenceLeave = ({ userId }: { userId: string }) =>
      setPresence((prev) => prev.filter((p) => p.userId !== userId));
    const handleChat = (message: ChatMessage) => setMessages((prev) => [...prev, message]);

    nextProvider.socket.on("presence:join", handlePresenceJoin);
    nextProvider.socket.on("presence:leave", handlePresenceLeave);
    nextProvider.socket.on("chat:message", handleChat);

    // Advisory-only integrity signals — never blocks or auto-flags a
    // candidate (PRD risk mitigation on anti-cheat). The server already
    // persists these (see apps/realtime/src/index.ts); nothing sent them
    // until now.
    const handleVisibility = () => {
      if (document.hidden) {
        nextProvider.socket.emit("integrity:signal", { interviewId, type: "TAB_BLUR" });
      }
    };
    const handlePaste = () =>
      nextProvider.socket.emit("integrity:signal", { interviewId, type: "PASTE" });

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("paste", handlePaste);
      nextProvider.destroy();
      setProvider(null);
    };
  }, [interviewId, token]);

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !provider) return;
    provider.socket.emit("chat:message", { interviewId, body });
    setDraft("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Interview room
            <Badge variant="secondary">{role}</Badge>
          </CardTitle>
          <CardDescription>Room {interviewId}</CardDescription>
        </CardHeader>
        <CardContent>
          {provider ? (
            <CodeEditor provider={provider} language={DEFAULT_LANGUAGE} />
          ) : (
            <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
              Connecting…
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {presence.length === 0 ? (
              <span className="text-muted-foreground">No one else has joined yet.</span>
            ) : (
              presence.map((p) => (
                <span key={p.userId}>
                  {p.userId} · {p.role}
                </span>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="text-base">Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-2">
            <div className="flex-1 space-y-1 overflow-y-auto text-sm">
              {messages.map((message, index) => (
                <div key={index}>
                  <span className="text-muted-foreground">{message.userId}:</span> {message.body}
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Say something…"
              />
              <Button type="submit" size="sm">
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
