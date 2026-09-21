import { describe, expect, test } from "vitest";
import { isAwaitingOutcome, OUTCOME_GRACE_MINUTES, slotEndsAt } from "./interview-timing";

const START = new Date("2026-09-21T10:00:00.000Z");
const at = (minutesAfterStart: number) => new Date(START.getTime() + minutesAfterStart * 60_000);
const interview = (status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW") => ({
  status,
  scheduledAt: START,
  durationMins: 60,
});

describe("slotEndsAt", () => {
  test("is the start plus the duration", () => {
    expect(slotEndsAt(interview("SCHEDULED")).toISOString()).toBe("2026-09-21T11:00:00.000Z");
  });
});

describe("isAwaitingOutcome", () => {
  test("not during the slot, or inside the grace period after it", () => {
    expect(isAwaitingOutcome(interview("IN_PROGRESS"), at(30))).toBe(false);
    // Running over is normal; the room still offers "Join" until the grace ends.
    expect(isAwaitingOutcome(interview("IN_PROGRESS"), at(60 + OUTCOME_GRACE_MINUTES - 1))).toBe(false);
  });

  test("from the end of the grace period, for either open status", () => {
    expect(isAwaitingOutcome(interview("SCHEDULED"), at(60 + OUTCOME_GRACE_MINUTES))).toBe(true);
    expect(isAwaitingOutcome(interview("IN_PROGRESS"), at(60 * 24 * 7))).toBe(true);
  });

  test("never once an outcome is recorded, however long ago the slot was", () => {
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(isAwaitingOutcome(interview(status), at(60 * 24 * 7))).toBe(false);
    }
  });
});
