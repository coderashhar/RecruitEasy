"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supportedLanguageSchema, type SupportedLanguage } from "@interviewhub/types";
import { runPractice } from "@/app/candidate/practice/actions";
import { STARTER_CODE, outputMatches, type PracticeProblem } from "@/lib/practice-problems";
import type { PracticeRunOutcome } from "@/lib/practice";

// Monaco touches `window` on import; `ssr: false` is only allowed from a
// Client Component, which is why the import lives here.
const PracticeEditor = dynamic(() => import("./practice-editor").then((m) => m.PracticeEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
});

const LANGUAGE_LABEL: Record<SupportedLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  cpp: "C++",
  go: "Go",
};

function draftKey(problemId: string, language: SupportedLanguage) {
  return `practice-draft:${problemId}:${language}`;
}

/**
 * Drafts live in this browser only. Practice is scratch work and nothing
 * about it is stored server-side; losing a draft to a cleared browser is an
 * acceptable cost of that. Every access is guarded because storage can be
 * unavailable (private windows, blocked site data) and must never break the page.
 */
function readDraft(problemId: string, language: SupportedLanguage): string {
  if (typeof window === "undefined") return STARTER_CODE[language];
  try {
    return window.localStorage.getItem(draftKey(problemId, language)) ?? STARTER_CODE[language];
  } catch {
    return STARTER_CODE[language];
  }
}

function writeDraft(problemId: string, language: SupportedLanguage, code: string) {
  try {
    if (code === STARTER_CODE[language]) {
      window.localStorage.removeItem(draftKey(problemId, language));
    } else {
      window.localStorage.setItem(draftKey(problemId, language), code);
    }
  } catch {
    // Storage unavailable: the draft just won't survive a reload.
  }
}

export interface PracticeWorkspaceProps {
  problems: PracticeProblem[];
  initialRemaining: number;
  runLimit: number;
}

export function PracticeWorkspace({ problems, initialRemaining, runLimit }: PracticeWorkspaceProps) {
  const [problemId, setProblemId] = useState(problems[0].id);
  const [language, setLanguage] = useState<SupportedLanguage>("python");
  // The editor itself is client-only, so reading a stored draft during the
  // first client render can't cause a hydration mismatch.
  const [code, setCode] = useState(() => readDraft(problems[0].id, "python"));
  const [stdin, setStdin] = useState(problems[0].sampleInput);
  const [result, setResult] = useState<PracticeRunOutcome | null>(null);
  const [ranWithSample, setRanWithSample] = useState(false);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [running, startRun] = useTransition();

  const problem = problems.find((entry) => entry.id === problemId) ?? problems[0];

  function selectProblem(next: PracticeProblem) {
    setProblemId(next.id);
    setCode(readDraft(next.id, language));
    setStdin(next.sampleInput);
    setResult(null);
  }

  function selectLanguage(next: SupportedLanguage) {
    setLanguage(next);
    setCode(readDraft(problem.id, next));
    setResult(null);
  }

  function handleCodeChange(next: string) {
    setCode(next);
    writeDraft(problem.id, language, next);
  }

  function handleReset() {
    setCode(STARTER_CODE[language]);
    writeDraft(problem.id, language, STARTER_CODE[language]);
  }

  function handleRun() {
    if (!code.trim()) return;
    const usingSample = stdin === problem.sampleInput;

    startRun(async () => {
      const response = await runPractice({ language, source: code, stdin: stdin || undefined });
      if (response.error) {
        toast.error(response.error);
        return;
      }
      if (response.result) {
        setResult(response.result);
        setRanWithSample(usingSample);
      }
      if (response.remaining !== undefined) setRemaining(response.remaining);
    });
  }

  // Only meaningful against the sample: with custom input there is no known
  // right answer to compare to.
  const verdict =
    result && ranWithSample && result.status === "SUCCEEDED"
      ? outputMatches(result.stdout, problem.sampleOutput)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">Problems</h2>
          <ul className="flex flex-col p-1.5">
            {problems.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => selectProblem(entry)}
                  aria-current={entry.id === problem.id}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
                    entry.id === problem.id ? "bg-muted font-medium" : ""
                  }`}
                >
                  <span>{entry.title}</span>
                  <Badge variant={entry.difficulty === "Easy" ? "secondary" : "outline"}>
                    {entry.difficulty}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <article className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
          <h1 className="text-base font-semibold">{problem.title}</h1>
          {problem.statement.map((paragraph) => (
            <p key={paragraph} className="text-muted-foreground">
              {paragraph}
            </p>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Sample input</div>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs">
                {problem.sampleInput}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Expected output</div>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-xs">
                {problem.sampleOutput}
              </pre>
            </div>
          </div>
        </article>
      </div>

      <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <select
              aria-label="Language"
              value={language}
              onChange={(event) => selectLanguage(event.target.value as SupportedLanguage)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {supportedLanguageSchema.options.map((option) => (
                <option key={option} value={option}>
                  {LANGUAGE_LABEL[option]}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={handleReset}>
              Reset code
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {remaining} of {runLimit} runs left this hour
            </span>
            <Button size="sm" onClick={handleRun} disabled={running || remaining === 0}>
              {running ? "Running…" : "Run"}
            </Button>
          </div>
        </div>

        <div className="h-[420px] min-h-0 bg-well">
          <PracticeEditor value={code} language={language} onChange={handleCodeChange} />
        </div>

        <div className="flex flex-col gap-1.5 border-t px-3 py-2.5">
          <label htmlFor="practice-stdin" className="text-xs font-medium text-muted-foreground">
            Input (stdin)
          </label>
          <textarea
            id="practice-stdin"
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {stdin !== problem.sampleInput && (
            <button
              type="button"
              onClick={() => setStdin(problem.sampleInput)}
              className="self-start text-xs text-primary hover:underline"
            >
              Use the sample input
            </button>
          )}
        </div>

        <div className="flex min-h-24 flex-col gap-1.5 border-t px-3 py-2.5 text-xs" aria-live="polite">
          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    result.status === "SUCCEEDED"
                      ? "secondary"
                      : result.status === "FAILED" || result.status === "TIMEOUT"
                        ? "destructive"
                        : "outline"
                  }
                >
                  {result.status}
                </Badge>
                {result.timeMs != null && <span className="text-muted-foreground">{result.timeMs} ms</span>}
                {result.memoryKb != null && (
                  <span className="text-muted-foreground">{(result.memoryKb / 1024).toFixed(1)} MB</span>
                )}
                {verdict === true && <Badge>Matches expected output</Badge>}
                {verdict === false && <Badge variant="outline">Doesn&apos;t match expected output yet</Badge>}
              </div>
              {result.stdout && (
                <pre className="whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono">{result.stdout}</pre>
              )}
              {result.stderr && (
                <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-destructive">
                  {result.stderr}
                </pre>
              )}
              {!result.stdout && !result.stderr && (
                <span className="text-muted-foreground">The program printed nothing.</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              Run your code to see its output here. Runs against the sample input are checked against
              the expected output.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
