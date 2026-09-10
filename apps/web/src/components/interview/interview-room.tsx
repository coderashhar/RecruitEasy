"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InterviewParticipantRole, InterviewStatus } from "@interviewhub/db";
import { DEFAULT_LANGUAGE, supportedLanguageSchema, type SupportedLanguage } from "@interviewhub/types";
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
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

// Same reason as the editor: livekit-client reaches for browser media APIs on
// import, so it must not be part of the server render.
const VideoPanel = dynamic(() => import("./video-panel").then((m) => m.VideoPanel), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 shrink-0 items-center justify-center rounded-lg border text-sm text-muted-foreground">
      Loading video…
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
  /** Null when LiveKit isn't configured — the room then runs without video. */
  videoToken: string | null;
  videoServerUrl: string | null;
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
  videoToken,
  videoServerUrl,
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

  // Lives in doc.getMap("meta"), not component state, so a language switch
  // travels over the same Y.Doc both people already share — rooms.ts's
  // persistSnapshot() reads this exact key, so this is also what finally
  // makes CodeDocument.language record something other than the default.
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    if (!provider) return;
    const meta = provider.doc.getMap("meta");

    const readLanguage = () => {
      const current = meta.get("language");
      if (supportedLanguageSchema.safeParse(current).success) {
        setLanguage(current as SupportedLanguage);
      }
    };

    // Covers a late joiner: doc:sync may already have hydrated meta with a
    // language someone picked before this client connected.
    readLanguage();
    meta.observe(readLanguage);
    return () => meta.unobserve(readLanguage);
  }, [provider]);

  function handleLanguageChange(next: SupportedLanguage) {
    // Yjs applies a local set synchronously and notifies observers in the
    // same tick, so the readLanguage() observer above updates `language` —
    // no separate setLanguage call needed here, and both clients end up
    // reading the change through the identical path.
    provider?.doc.getMap("meta").set("language", next);
  }

  // Local-only, deliberately not shared over the Y.Doc like `language` is:
  // one person collapsing the editor mid-thought for the other would be
  // hostile. This is a per-viewer preference, not shared document state.
  const [editorHidden, setEditorHidden] = useState(false);

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

  const onlineCount = roster.filter((entry) => connectedIds.includes(entry.userId)).length;

  return (
    // `min-h-0` at every level of this chain is what lets the editor pane
    // resolve a real height. A flex child defaults to `min-height: auto`,
    // which refuses to shrink below its content — so without these, the
    // editor's own height never resolves and Monaco measures nothing.
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {candidateName} — {jobTitle}
          </h1>
          {/* suppressHydrationWarning because toLocaleString resolves against
              whichever runtime formats it: the server's timezone during SSR
              (UTC on Vercel), the viewer's in the browser. The viewer's is the
              correct one — the same reasoning as scheduled-at-field.tsx — so
              the mismatch is expected rather than a defect to design around,
              and the client value replaces it on the first re-render. */}
          <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
            {scheduledAt.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · {durationMins} min · you are the {role.toLowerCase()}
          </p>
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditorHidden((hidden) => !hidden)}
          >
            {editorHidden ? "Show editor" : "Hide editor"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* Deliberately not a <Card>: its `overflow-hidden` and
            `--card-spacing` padding break the parent chain Monaco measures
            itself against, which is what collapsed the editor to a few
            pixels wide. A plain bordered box looks the same and measures. */}
        {!editorHidden && (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">shared editor</span>
                <select
                  aria-label="Language"
                  value={language}
                  disabled={!provider}
                  onChange={(event) =>
                    handleLanguageChange(event.target.value as SupportedLanguage)
                  }
                  className="h-6 rounded-md border border-input bg-transparent px-1.5 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  {supportedLanguageSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-muted-foreground">
                {onlineCount} of {roster.length} here
              </span>
            </div>
            <div className="min-h-0 flex-1">
              {provider ? (
                <CodeEditor provider={provider} language={language} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {connection === "unauthorized"
                    ? "Your session for this interview expired. Reload the page."
                    : "Connecting…"}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Fills the row when the editor is hidden, rather than sitting in a
            fixed rail — video is the whole room at that point, not a sidebar. */}
        <aside
          className={
            editorHidden
              ? "flex min-h-0 flex-1 flex-col gap-3"
              : "flex shrink-0 flex-col gap-3 lg:h-full lg:w-[360px]"
          }
        >
          {videoToken && videoServerUrl && (
            <VideoPanel serverUrl={videoServerUrl} token={videoToken} fill={editorHidden} />
          )}

          <div className="shrink-0 rounded-lg border bg-card">
            <h2 className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Participants
            </h2>
            <ul className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
              {roster.map((entry) => {
                const online = connectedIds.includes(entry.userId);
                return (
                  <li key={entry.userId} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
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
                      {online ? entry.role.toLowerCase() : "away"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Takes the leftover height on desktop; on smaller screens it
              gets a workable fixed height instead of collapsing. */}
          <div className="flex h-56 min-h-0 flex-col overflow-hidden rounded-lg border bg-card lg:h-auto lg:flex-1">
            <h2 className="shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Chat
            </h2>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5 text-sm">
              {messages.length === 0 ? (
                <span className="text-muted-foreground">No messages yet.</span>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className="break-words">
                    <span className="font-medium">{nameFor(message.userId)}:</span>{" "}
                    {message.body}
                  </div>
                ))
              )}
            </div>
            <form onSubmit={sendMessage} className="flex shrink-0 gap-2 border-t p-2">
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
          </div>
        </aside>
      </div>
    </div>
  );
}
