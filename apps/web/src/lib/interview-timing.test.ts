import { describe, expect, test } from "vitest";
import { MAX_INTERVIEW_DURATION_MINS } from "@interviewhub/types";
import {
  currentLookbackStart,
  isAwaitingOutcome,
  isCurrentInterview,
  OUTCOME_GRACE_MINUTES,
  slotEndsAt,
} from "./interview-timing";

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

describe("isCurrentInterview", () => {
  test("a SCHEDULED interview stays current after its start time", () => {
    // The candidate who opens their dashboard a few minutes late must still
    // find the room link, whether or not anyone pressed start.
    expect(isCurrentInterview(interview("SCHEDULED"), at(2))).toBe(true);
    expect(isCurrentInterview(interview("SCHEDULED"), at(60 + OUTCOME_GRACE_MINUTES - 1))).toBe(true);
  });

  test("and becomes past once its slot and the grace period are over", () => {
    expect(isCurrentInterview(interview("SCHEDULED"), at(60 + OUTCOME_GRACE_MINUTES))).toBe(false);
  });

  test("IN_PROGRESS is always current, however long it was left open", () => {
    expect(isCurrentInterview(interview("IN_PROGRESS"), at(60 * 24 * 7))).toBe(true);
  });

  test("a recorded outcome is never current", () => {
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(isCurrentInterview(interview(status), at(-60))).toBe(false);
    }
  });
});

describe("currentLookbackStart", () => {
  test("reaches back far enough for the longest interview there can be", () => {
    // Queries filter on this in SQL, so it must never cut off a current one.
    const now = at(MAX_INTERVIEW_DURATION_MINS + OUTCOME_GRACE_MINUTES - 1);
    const longest = { status: "SCHEDULED" as const, scheduledAt: START, durationMins: MAX_INTERVIEW_DURATION_MINS };

    expect(isCurrentInterview(longest, now)).toBe(true);
    expect(currentLookbackStart(now).getTime()).toBeLessThanOrEqual(START.getTime());
  });
});
