"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InterviewParticipantRole, InterviewStatus } from "@interviewhub/db";
import {
  DEFAULT_LANGUAGE,
  supportedLanguageSchema,
  type ExecutionResult,
  type SupportedLanguage,
} from "@interviewhub/types";
import type { RosterEntry } from "@/lib/interview-access";
import { getExecutionResult, runCode } from "@/app/interview/[id]/actions";
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
    <div className="flex min-h-64 flex-[3] items-center justify-center rounded-lg border text-sm text-muted-foreground">
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

  // Only consulted with the editor hidden. Alongside the editor, people and
  // chat live in the rail and are always visible; once the call owns the
  // screen they'd be taking room from the thing you switched over to see, so
  // they move behind a toggle and default to closed.
  const [sidePanel, setSidePanel] = useState<"people" | "chat" | null>(null);

  const [executing, startExecutionTransition] = useTransition();
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

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

    // Carries only an id (see apps/realtime/src/index.ts's /internal/broadcast
    // handler) — reaching every socket in the room, including whoever
    // clicked Run themselves, since it's emitted with io.to(), not
    // socket.to(). Resolving it into the actual output is the same
    // getExecutionResult call for every participant; there's no separate
    // path for the clicker's own view.
    const handleExecutionResult = ({ executionId }: { executionId: string }) => {
      getExecutionResult(interviewId, executionId)
        .then((result) => {
          if (result) setExecutionResult(result);
        })
        .catch((err) => console.error("[interview] failed to fetch execution result", err));
    };

    nextProvider.socket.on("presence:list", handlePresenceList);
    nextProvider.socket.on("presence:join", handlePresenceJoin);
    nextProvider.socket.on("presence:leave", handlePresenceLeave);
    nextProvider.socket.on("chat:message", handleChat);
    nextProvider.socket.on("execution:result", handleExecutionResult);

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

  function handleRunCode() {
    if (!provider) return;
    // The shared Y.Doc is the one source of truth for what's actually in
    // the editor — reading it here rather than tracking a separate copy of
    // the source in component state means Run can never send stale code.
    const source = provider.doc.getText("code").toString();
    if (!source.trim()) return;

    const formData = new FormData();
    formData.set("interviewId", interviewId);
    formData.set("language", language);
    formData.set("source", source);

    startExecutionTransition(async () => {
      try {
        await runCode(formData);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not run the code.");
      }
    });
  }

  const connectionCopy = STATUS_COPY[connection];

  const onlineCount = roster.filter((entry) => connectedIds.includes(entry.userId)).length;

  // Defined once and placed in two different containers — the rail beside the
  // editor, and the slide-in panel when the call owns the screen. Same markup
  // either way, so the two modes can't drift apart.
  const participantsBlock = (
    <div className="shrink-0 overflow-hidden rounded-lg border bg-card">
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
  );

  const chatBlock = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
      <h2 className="shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        Chat
      </h2>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5 text-sm">
        {messages.length === 0 ? (
          <span className="text-muted-foreground">No messages yet.</span>
        ) : (
          messages.map((message, index) => (
            <div key={index} className="break-words">
              <span className="font-medium">{nameFor(message.userId)}:</span> {message.body}
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
  );

  const videoBlock = videoToken && videoServerUrl && (
    <VideoPanel serverUrl={videoServerUrl} token={videoToken} fill={editorHidden} />
  );

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
          {/* People and chat are always on screen in the rail alongside the
              editor, so these only earn their place once the call has taken
              over the room. */}
          {editorHidden && (
            <>
              <Button
                size="sm"
                variant={sidePanel === "people" ? "secondary" : "outline"}
                aria-pressed={sidePanel === "people"}
                onClick={() => setSidePanel((open) => (open === "people" ? null : "people"))}
              >
                People ({onlineCount})
              </Button>
              <Button
                size="sm"
                variant={sidePanel === "chat" ? "secondary" : "outline"}
                aria-pressed={sidePanel === "chat"}
                onClick={() => setSidePanel((open) => (open === "chat" ? null : "chat"))}
              >
                Chat
              </Button>
            </>
          )}
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
                <Button size="sm" disabled={!provider || executing} onClick={handleRunCode}>
                  {executing ? "Running…" : "Run"}
                </Button>
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
            {executionResult && (
              <div className="flex max-h-56 shrink-0 flex-col gap-1.5 overflow-y-auto border-t px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      executionResult.status === "SUCCEEDED"
                        ? "secondary"
                        : executionResult.status === "FAILED" || executionResult.status === "TIMEOUT"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {executionResult.status}
                  </Badge>
                  {executionResult.timeMs != null && (
                    <span className="text-muted-foreground">{executionResult.timeMs} ms</span>
                  )}
                  {executionResult.memoryKb != null && (
                    <span className="text-muted-foreground">
                      {(executionResult.memoryKb / 1024).toFixed(1)} MB
                    </span>
                  )}
                </div>
                {executionResult.stdout && (
                  <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono">
                    {executionResult.stdout}
                  </pre>
                )}
                {executionResult.stderr && (
                  <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-destructive">
                    {executionResult.stderr}
                  </pre>
                )}
              </div>
            )}
          </section>
        )}

        {/* The call keeps this one slot in the tree in both layouts, and only
            its own classes change between them.

            It cannot be moved into a different parent per layout — a rail in
            one branch, a full-width column in the other. React reconciles a
            child by its position *and* element type, so swapping the element
            at this slot unmounts everything under it, VideoPanel included.
            That tore down the LiveKit connection and dropped both people back
            to "Join call" every time either of them toggled the editor. */}
        <div
          className={
            editorHidden
              ? // The call gets the whole row. Nothing else competes for
                // height here — that competition is exactly what left the
                // video letterboxed in a short band with dead space beneath.
                "flex min-h-0 min-w-0 flex-1 flex-col"
              : "flex shrink-0 flex-col gap-3 lg:h-full lg:w-[360px]"
          }
        >
          {videoBlock}
          {/* Alongside the editor these share the rail with the call; once the
              call owns the room they move behind the header toggles. Safe to
              move, unlike the call: every piece of their state (messages,
              draft, roster) lives up here, so remounting them costs nothing. */}
          {!editorHidden && (
            <>
              {participantsBlock}
              {chatBlock}
            </>
          )}
        </div>

        {editorHidden && sidePanel && (
          <aside className="flex w-full shrink-0 flex-col gap-3 lg:h-full lg:w-[360px]">
            {sidePanel === "people" ? participantsBlock : chatBlock}
          </aside>
        )}
      </div>
    </div>
  );
}
