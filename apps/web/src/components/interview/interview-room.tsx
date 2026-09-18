"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { StatusBadge, StatusGlyph, type Shape, type Tone } from "@/components/broadsheet/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InterviewParticipantRole, InterviewStatus } from "@interviewhub/db";
import {
  DEFAULT_LANGUAGE,
  supportedLanguageSchema,
  type ChatMessageEvent,
  type ExecutionResult,
  type IntegritySignalEvent,
  type RecordingRoomState,
  type SupportedLanguage,
} from "@interviewhub/types";
import { INTEGRITY_DISCLOSURE, describeIntegritySignal } from "@/lib/integrity";
import type { RosterEntry } from "@/lib/interview-access";
import {
  getExecutionResult,
  refreshInterviewToken,
  runCode,
  setRecording,
} from "@/app/interview/[id]/actions";
import { DockButton, DockDivider, RoomDock, RoomHeader } from "./room-chrome";
import { SocketYjsProvider, type ConnectionStatus } from "./socket-yjs-provider";
import { cn } from "@/lib/utils";

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
    <div className="flex aspect-video items-center justify-center bg-[oklch(0.19_0.004_85)] font-mono text-xs text-muted-foreground">
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
  /** True when video is on and LiveKit + R2 are configured for recording. */
  recordingAvailable: boolean;
  initialRecordingState: RecordingRoomState;
}

/**
 * Union of two message lists by id, in send order. A live chat:message and
 * the chat:history replay sent on (re)connect can overlap in either order —
 * a message can land just before the replay that also contains it, or the
 * replay can arrive first — so neither may simply replace or append.
 */
function mergeMessages(current: ChatMessageEvent[], incoming: ChatMessageEvent[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.at - b.at);
}

const EXECUTION_STATUS: Record<ExecutionResult["status"], { label: string; tone: Tone; shape: Shape }> = {
  QUEUED: { label: "Queued", tone: "neutral", shape: "hollow" },
  RUNNING: { label: "Running", tone: "info", shape: "half" },
  SUCCEEDED: { label: "Succeeded", tone: "success", shape: "square" },
  FAILED: { label: "Failed", tone: "danger", shape: "bar" },
  TIMEOUT: { label: "Timed out", tone: "danger", shape: "bar" },
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
  recordingAvailable,
  initialRecordingState,
}: InterviewRoomProps) {
  const [recordingState, setRecordingState] = useState<RecordingRoomState>(initialRecordingState);
  const [recordingBusy, startRecordingTransition] = useTransition();
  const [provider, setProvider] = useState<SocketYjsProvider | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  // The realtime service emits room:error and hangs up when it can't hydrate
  // the room — without this the editor sat on "Connecting…" forever, with
  // nothing on screen explaining why.
  const [joinError, setJoinError] = useState<string | null>(null);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessageEvent[]>([]);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Keeps the newest message in view, including the replay on join.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // Presence and chat arrive from the realtime service carrying only a
  // userId; the roster is what turns those into names.
  const nameFor = useCallback(
    (userId: string) => roster.find((entry) => entry.userId === userId)?.name ?? "Unknown",
    [roster],
  );

  // Read through a ref inside the socket effect: depending on nameFor there
  // would tear down and rebuild the connection whenever the roster prop's
  // identity changed, dropping the editor and chat for a re-render.
  const nameForRef = useRef(nameFor);
  useEffect(() => {
    nameForRef.current = nameFor;
  }, [nameFor]);

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
      refreshToken: () => refreshInterviewToken(interviewId),
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
    const handleChat = (message: ChatMessageEvent) =>
      setMessages((prev) => mergeMessages(prev, [message]));
    const handleChatHistory = (history: ChatMessageEvent[]) =>
      setMessages((prev) => mergeMessages(prev, history));

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

    const handleRoomError = ({ message }: { message?: string }) =>
      setJoinError(message ?? "Could not join the interview room.");

    nextProvider.socket.on("room:error", handleRoomError);
    nextProvider.socket.on("presence:list", handlePresenceList);
    nextProvider.socket.on("presence:join", handlePresenceJoin);
    nextProvider.socket.on("presence:leave", handlePresenceLeave);
    nextProvider.socket.on("chat:message", handleChat);
    nextProvider.socket.on("chat:history", handleChatHistory);
    nextProvider.socket.on("execution:result", handleExecutionResult);

    // Everyone in the room follows the recording state — that is what keeps
    // the REC badge honest for the candidate, not just the interviewer's view.
    nextProvider.socket.on(
      "recording:state",
      ({ state, message }: { state: RecordingRoomState; message?: string }) => {
        setRecordingState(state);
        if (state === "failed" && message) toast.error(message);
      },
    );

    // Interviewers and observers see the candidate's signals as they happen,
    // as a passing note rather than an alert — they are context, not verdicts.
    const handleIntegritySignal = ({ userId, type, payload }: IntegritySignalEvent) => {
      toast(`${nameForRef.current(userId)}: ${describeIntegritySignal(type, payload)}`);
    };
    if (role !== "CANDIDATE") {
      nextProvider.socket.on("integrity:signal", handleIntegritySignal);
    }

    // Advisory-only integrity signals — never blocks or auto-flags a
    // candidate (PRD risk mitigation on anti-cheat). Sent only about the
    // candidate: an interviewer switching tabs to check notes, or pasting a
    // starter snippet, is not something to put on the candidate's record.
    const emitSignal = (type: IntegritySignalEvent["type"], payload?: { length: number }) =>
      nextProvider.socket.emit("integrity:signal", { interviewId, type, payload });

    const handleVisibility = () => {
      if (document.hidden) emitSignal("TAB_BLUR");
    };

    // Only pastes into the shared editor. Pasting a link into chat is not a
    // coding-integrity question. The length is read and sent; the text is not.
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".monaco-editor")) return;
      emitSignal("PASTE", { length: event.clipboardData?.getData("text/plain").length ?? 0 });
    };

    // fullscreenchange fires on entering and on leaving; only leaving counts.
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) emitSignal("FULLSCREEN_EXIT");
    };

    const isCandidate = role === "CANDIDATE";
    if (isCandidate) {
      document.addEventListener("visibilitychange", handleVisibility);
      document.addEventListener("paste", handlePaste);
      document.addEventListener("fullscreenchange", handleFullscreenChange);
    }

    return () => {
      if (isCandidate) {
        document.removeEventListener("visibilitychange", handleVisibility);
        document.removeEventListener("paste", handlePaste);
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
      nextProvider.destroy();
      setProvider(null);
      setConnectedIds([]);
    };
  }, [interviewId, token, currentUserId, me?.name, role]);

  // Tracked from fullscreenchange rather than read during render, since
  // `document` doesn't exist on the server.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        toast.error("Your browser didn't allow full screen.");
      });
    }
  }

  function handleRecordingToggle() {
    const action = recordingState === "recording" ? "stop" : "start";
    startRecordingTransition(async () => {
      const result = await setRecording(interviewId, action);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      // The broadcast updates everyone, this client included; setting it here
      // too keeps the button right if the realtime service is unreachable.
      setRecordingState(action === "start" ? "recording" : "processing");
    });
  }

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

  const onlineCount = roster.filter((entry) => connectedIds.includes(entry.userId)).length;
  const interviewersHere = roster.filter(
    (entry) => entry.role === "INTERVIEWER" && connectedIds.includes(entry.userId),
  );
  const interviewerNames = roster.filter((entry) => entry.role === "INTERVIEWER").map((entry) => entry.name);
  const canRecord =
    role === "INTERVIEWER" &&
    recordingAvailable &&
    (recordingState === "idle" || recordingState === "failed" || recordingState === "recording");
  // An observer watches: the realtime service drops their edits and the run
  // action refuses them, so the controls are hidden rather than left to fail.
  const canEdit = role !== "OBSERVER";
  const leaveHref = role === "CANDIDATE" ? "/candidate/interviews" : "/recruiter/interviews";
  // As of page load: a status change mid-call isn't broadcast to the room.
  const ended = status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW";

  // Defined once and placed in two different containers — the rail beside the
  // editor, and the slide-in panel when the call owns the screen. Same markup
  // either way, so the two modes can't drift apart.
  const participantsBlock = (
    <div className="shrink-0 px-3.5 pb-3">
      <h2 className="border-b pb-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Participants · {onlineCount} of {roster.length} here
      </h2>
      <ul className="flex flex-col text-[13.5px]">
        {roster.map((entry) => {
          const online = connectedIds.includes(entry.userId);
          return (
            <li key={entry.userId} className="flex items-center justify-between gap-2 py-[9px]">
              <span className="flex min-w-0 items-center gap-[9px]">
                <StatusGlyph shape={online ? "square" : "hollow"} tone={online ? "success" : "neutral"} />
                <span className={cn("truncate", !online && "text-muted-foreground")}>
                  {entry.name}
                  {entry.userId === currentUserId && " (you)"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground capitalize">
                {online ? entry.role.toLowerCase() : "away"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const chatBlock = (
    <div className="flex min-h-0 flex-1 flex-col border-t">
      <h2 className="shrink-0 px-3.5 pt-3 pb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        Chat
      </h2>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-1.5 text-[13.5px] leading-normal">
        {messages.length === 0 ? (
          <span className="text-muted-foreground">No messages yet.</span>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="break-words">
              <div className="mb-[3px] text-[11.5px] text-muted-foreground">
                {nameFor(message.userId)} ·{" "}
                {new Date(message.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
              </div>
              {message.body}
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={sendMessage} className="flex shrink-0 gap-2 border-t px-3.5 py-3">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          aria-label="Chat message"
          className="h-8"
        />
        <Button type="submit" variant="outline" disabled={!provider}>
          Send
        </Button>
      </form>
    </div>
  );

  const videoBlock = videoToken && videoServerUrl && (
    <VideoPanel serverUrl={videoServerUrl} token={videoToken} fill={editorHidden} />
  );

  return (
    // Dark in both themes, deliberately: a camera tile is a lit face, and on a
    // light page every tile reads as a hole punched in the paper. The theme
    // switch changes the app around the room, not the room itself.
    //
    // `min-h-0` at every level of this chain is what lets the editor pane
    // resolve a real height. A flex child defaults to `min-height: auto`,
    // which refuses to shrink below its content — so without these, the
    // editor's own height never resolves and Monaco measures nothing.
    <div className="dark relative flex h-dvh flex-col bg-[oklch(0.155_0.004_85)] text-foreground">
      <RoomHeader
        title={`${candidateName} · ${jobTitle}`}
        subtitle={
          // suppressHydrationWarning because toLocaleString resolves against
          // whichever runtime formats it: the server's timezone during SSR
          // (UTC on Vercel), the viewer's in the browser. The viewer's is the
          // correct one — the same reasoning as scheduled-at-field.tsx — so
          // the mismatch is expected rather than a defect to design around,
          // and the client value replaces it on the first re-render.
          <span suppressHydrationWarning>
            {scheduledAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {durationMins} min ·
            you are the {role.toLowerCase()}
          </span>
        }
        leaveHref={leaveHref}
        connection={connection}
        recordingState={recordingState}
        scheduledAt={scheduledAt}
        durationMins={durationMins}
      />

      {(role === "CANDIDATE" ||
        joinError !== null ||
        connection === "reconnecting" ||
        connection === "disconnected" ||
        connection === "unauthorized" ||
        ended) && (
        <div className="flex shrink-0 flex-col gap-2 border-b px-5 py-2.5">
          {ended && (
            <CalloutBanner
              tone="info"
              title={status === "COMPLETED" ? "This interview is complete" : "This interview is closed"}
              action={
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={leaveHref}>Back to interviews</Link>} />
              }
            >
              {role === "INTERVIEWER" && status === "COMPLETED"
                ? "Feedback is due within 24 hours — write it from the interview's page."
                : "The editor and chat stay readable here; nothing new is recorded."}
            </CalloutBanner>
          )}
          {joinError && (
            <CalloutBanner
              tone="danger"
              role="alert"
              title={joinError}
              action={
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Reload the room
                </Button>
              }
            >
              Nothing you wrote is lost — the shared document is stored on the server. If reloading doesn&apos;t
              help, the interview may have been deleted; open it from your interviews list.
            </CalloutBanner>
          )}
          {(connection === "reconnecting" || connection === "disconnected") && (
            <CalloutBanner tone="warning" title="Connection lost — reconnecting" pulse role="status">
              Your code is kept in the shared document and syncs when the connection returns.
            </CalloutBanner>
          )}
          {connection === "unauthorized" && (
            <CalloutBanner tone="danger" title="Your session for this interview expired" role="alert">
              Reload the page to rejoin. Nothing you wrote is lost.
            </CalloutBanner>
          )}
          {role === "CANDIDATE" && provider && interviewersHere.length === 0 && (
            <CalloutBanner tone="info" title={`Waiting for ${interviewerNames.join(" and ") || "your interviewer"}`} role="status">
              You are in the room and the editor is ready. The interview starts when they join.
            </CalloutBanner>
          )}
          {role === "CANDIDATE" && (
            <p className="text-xs text-muted-foreground">
              {INTEGRITY_DISCLOSURE.summary} {INTEGRITY_DISCLOSURE.detail}
            </p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Deliberately not a <Card>: its `overflow-hidden` and
            `--card-spacing` padding break the parent chain Monaco measures
            itself against, which is what collapsed the editor to a few
            pixels wide. A plain box measures. */}
        {!editorHidden && (
          <section className="flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0 lg:border-r">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex items-center gap-3">
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">shared editor</span>
                <select
                  aria-label="Language"
                  value={language}
                  disabled={!provider || !canEdit}
                  onChange={(event) =>
                    handleLanguageChange(event.target.value as SupportedLanguage)
                  }
                  className="h-[26px] border border-input bg-transparent px-2.5 font-mono text-[11.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  {supportedLanguageSchema.options.map((option) => (
                    <option key={option} value={option} className="bg-background">
                      {option}
                    </option>
                  ))}
                </select>
                {canEdit ? (
                  <Button size="sm" className="h-[26px] px-3.5" disabled={!provider || executing} onClick={handleRunCode}>
                    {executing ? "Running…" : "Run"}
                  </Button>
                ) : (
                  <span className="font-mono text-[11.5px] text-muted-foreground">watching · read-only</span>
                )}
              </div>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {onlineCount} of {roster.length} here · synced
              </span>
            </div>
            <div className="min-h-0 flex-1 bg-well">
              {provider ? (
                <CodeEditor provider={provider} language={language} readOnly={!canEdit} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[13px] text-muted-foreground">
                  {connection === "unauthorized"
                    ? "Your session for this interview expired. Reload the page."
                    : "Connecting…"}
                </div>
              )}
            </div>
            {executionResult && (
              <div className="flex max-h-56 shrink-0 flex-col border-t">
                <div className="flex h-[38px] shrink-0 items-center gap-3.5 border-b border-hairline px-4">
                  <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Output</span>
                  {(() => {
                    const display = EXECUTION_STATUS[executionResult.status];
                    return (
                      <StatusBadge tone={display.tone} shape={display.shape} size="sm">
                        {display.label}
                      </StatusBadge>
                    );
                  })()}
                  <span className="font-mono text-[11.5px] text-muted-foreground">
                    {[
                      executionResult.timeMs != null && `${executionResult.timeMs} ms`,
                      executionResult.memoryKb != null && `${(executionResult.memoryKb / 1024).toFixed(1)} MB`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="overflow-y-auto">
                  {executionResult.stdout && (
                    <pre className="px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {executionResult.stdout}
                    </pre>
                  )}
                  {executionResult.stderr && (
                    <pre className="px-4 py-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-(--tone-danger-fg)">
                      {executionResult.stderr}
                    </pre>
                  )}
                </div>
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
                "flex min-h-0 min-w-0 flex-1 flex-col p-3.5 pb-20"
              : "flex shrink-0 flex-col pb-20 lg:h-full lg:w-[348px] lg:pb-0"
          }
        >
          {videoBlock && <div className={cn("flex min-h-0 flex-col", editorHidden ? "flex-1" : "p-3.5")}>{videoBlock}</div>}
          {/* Alongside the editor these share the rail with the call; once the
              call owns the room they move behind the dock toggles. Safe to
              move, unlike the call: every piece of their state (messages,
              draft, roster) lives up here, so remounting them costs nothing. */}
          {!editorHidden && (
            <>
              <div className={cn(!videoBlock && "pt-3.5")}>{participantsBlock}</div>
              {chatBlock}
            </>
          )}
        </div>

        {editorHidden && sidePanel && (
          <aside className="flex w-full shrink-0 flex-col border-l pt-3.5 pb-20 lg:h-full lg:w-[348px]">
            {sidePanel === "people" ? participantsBlock : chatBlock}
          </aside>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
        <RoomDock>
          <DockButton pressed={editorHidden} onClick={() => setEditorHidden((hidden) => !hidden)}>
            {editorHidden ? "Show editor" : "Hide editor"}
          </DockButton>
          {/* People and chat are always on screen in the rail alongside the
              editor, so these only earn their place once the call has taken
              over the room. */}
          {editorHidden && (
            <>
              <DockButton
                pressed={sidePanel === "people"}
                onClick={() => setSidePanel((open) => (open === "people" ? null : "people"))}
              >
                People · {onlineCount}
              </DockButton>
              <DockButton
                pressed={sidePanel === "chat"}
                onClick={() => setSidePanel((open) => (open === "chat" ? null : "chat"))}
              >
                Chat
              </DockButton>
            </>
          )}
          <DockButton pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </DockButton>
          {canRecord && (
            <>
              <DockDivider />
              <DockButton disabled={recordingBusy} onClick={handleRecordingToggle}>
                <StatusGlyph
                  shape={recordingState === "recording" ? "square" : "dot"}
                  tone="danger"
                  className={cn(recordingState === "recording" && "animate-rec-pulse")}
                />
                {recordingState === "recording" ? "Stop recording" : "Record"}
              </DockButton>
            </>
          )}
        </RoomDock>
      </div>
    </div>
  );
}
