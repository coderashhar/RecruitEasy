"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeObserverAction } from "./actions";

const selectClassName =
  "h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 disabled:opacity-60";

export function RemoveObserverButton({ interviewId, userId, name }: { interviewId: string; userId: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    const formData = new FormData();
    formData.set("interviewId", interviewId);
    formData.set("userId", userId);
    formData.set("intent", "remove");
    startTransition(async () => {
      try {
        await changeObserverAction(formData);
        toast.success(`${name} removed. If they're in the room now they stay until they leave.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not remove the observer.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label={`Remove ${name} as an observer`}
      className="text-xs text-primary hover:underline disabled:opacity-60"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function AddObserverForm({
  interviewId,
  candidates,
}: {
  interviewId: string;
  candidates: Array<{ id: string; name: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState("");

  if (candidates.length === 0) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await changeObserverAction(formData);
        toast.success("Observer added. They've been notified.");
        setUserId("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not add the observer.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3.5 flex items-center gap-2">
      <input type="hidden" name="interviewId" value={interviewId} />
      <select
        name="userId"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className={selectClassName}
        aria-label="Add an observer"
        required
      >
        <option value="">Add an observer…</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending || !userId}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
