"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

const subscribe = () => () => {};

/**
 * Changes the app around the interview room, never the room itself — video
 * is dark in both themes.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The stored theme is only readable in the browser; rendering a guess on the
  // server would mark the wrong option as pressed until hydration.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <div role="group" aria-label="Theme" className={cn("flex font-mono text-[11px]", className)}>
      {OPTIONS.map((option) => {
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "px-2 py-1 tracking-wide text-muted-foreground transition-colors hover:text-foreground first:pl-0",
              active && "font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
