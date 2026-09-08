"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { InterviewParticipantRole, InterviewStatus } from "@interviewhub/db";
import { DEFAULT_LANGUAGE } from "@interviewhub/types";
import type { RosterEntry } from "@/lib/interview-access";
import { SocketYjsProvider, type ConnectionStatus } from "./socket-yjs-provider";

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
  currentUserId: string;
  roster: RosterEntry[];
  jobTitle: string;
  candidateName: string;
  scheduledAt: Date;
  durationMins: number;
  status: InterviewStatus;
}

interface ChatMessage {
  userId: string;
  body: string;
  at: number;
}

const STATUS_COPY: Record<ConnectionStatus, { label: string; tone: "ok" | "warn" | "bad" }> = {
  connecting: { label: "Connecting…", tone: "warn" },
  connected: { label: "Connected", tone: "ok" },
  reconnecting: { label: "Reconnecting…", tone: "warn" },
  disconnected: { label: "Disconnected", tone: "bad" },
  unauthorized: { label: "Session expired — reload", tone: "bad" },
};

export function InterviewRoom({
  interviewId,
  token,
  role,
  currentUserId,
  roster,
  jobTitle,
  candidateName,
  scheduledAt,
  durationMins,
  status,
}: InterviewRoomProps) {
  const [provider, setProvider] = useState<SocketYjsProvider | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  // Presence and chat arrive from the realtime service carrying only a
  // userId; the roster is what turns those into names.
  const nameFor = useCallback(
    (userId: string) => roster.find((entry) => entry.userId === userId)?.name ?? "Unknown",
    [roster],
  );

  const me = useMemo(
    () => roster.find((entry) => entry.userId === currentUserId),
    [roster, currentUserId],
  );

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_REALTIME_URL;
    if (!url) {
      console.error("[interview] NEXT_PUBLIC_REALTIME_URL is not set — cannot join the room.");
      return;
    }

    const nextProvider = new SocketYjsProvider({
      url,
      token,
      identity: { userId: currentUserId, name: me?.name ?? "Unknown" },
      onStatus: setConnection,
    });

    // Revealed once the socket actually connects, not the instant it's
    // constructed (connecting is inherently async) — this also keeps the
    // very first setState call inside an event callback rather than
    // synchronously in the effect body.
    nextProvider.socket.once("connect", () => setProvider(nextProvider));

    // The server sends the full roster of connected sockets on join, then
    // incremental join/leave after that. Without the list, whoever joined
    // second never learned the first was already there.
    const handlePresenceList = (entries: Array<{ userId: string }>) =>
      setConnectedIds(entries.map((entry) => entry.userId));
    const handlePresenceJoin = ({ userId }: { userId: string }) =>
      setConnectedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    const handlePresenceLeave = ({ userId }: { userId: string }) =>
      setConnectedIds((prev) => prev.filter((id) => id !== userId));
    const handleChat = (message: ChatMessage) => setMessages((prev) => [...prev, message]);

    nextProvider.socket.on("presence:list", handlePresenceList);
    nextProvider.socket.on("presence:join", handlePresenceJoin);
    nextProvider.socket.on("presence:leave", handlePresenceLeave);
    nextProvider.socket.on("chat:message", handleChat);

    // Advisory-only integrity signals — never blocks or auto-flags a
    // candidate (PRD risk mitigation on anti-cheat).
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
      setConnectedIds([]);
    };
  }, [interviewId, token, currentUserId, me?.name]);

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !provider) return;
    provider.socket.emit("chat:message", { interviewId, body });
    setDraft("");
  }

  const connectionCopy = STATUS_COPY[connection];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>
              {candidateName} — {jobTitle}
            </CardTitle>
            <CardDescription>
              {scheduledAt.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · {durationMins} min · you are the {role.toLowerCase()}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{status}</Badge>
            <Badge
              variant={
                connectionCopy.tone === "ok"
                  ? "secondary"
                  : connectionCopy.tone === "bad"
                    ? "destructive"
                    : "outline"
              }
            >
              {connectionCopy.label}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="p-0">
            {provider ? (
              <CodeEditor provider={provider} language={DEFAULT_LANGUAGE} />
            ) : (
              <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
                {connection === "unauthorized"
                  ? "Your session for this interview expired. Reload the page."
                  : "Connecting…"}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Participants</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {roster.map((entry) => {
                const online = connectedIds.includes(entry.userId);
                return (
                  <div key={entry.userId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${
                          online ? "bg-emerald-500" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className="truncate">
                        {entry.name}
                        {entry.userId === currentUserId && " (you)"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {online ? entry.role : "away"}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col">
            <CardHeader>
              <CardTitle className="text-base">Chat</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-2">
              <div className="flex-1 space-y-1 overflow-y-auto text-sm">
                {messages.length === 0 ? (
                  <span className="text-muted-foreground">No messages yet.</span>
                ) : (
                  messages.map((message, index) => (
                    <div key={index}>
                      <span className="font-medium">{nameFor(message.userId)}:</span>{" "}
                      {message.body}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Say something…"
                  aria-label="Chat message"
                />
                <Button type="submit" size="sm" disabled={!provider}>
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
