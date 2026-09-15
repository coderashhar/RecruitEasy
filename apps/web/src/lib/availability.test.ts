import { describe, expect, it } from "vitest";
import { localWeekStart, slotState } from "./availability";

const NOW = new Date("2026-10-05T08:00:00Z");
const busy = [
  { interviewerId: "alice", start: "2026-10-06T10:00:00Z", end: "2026-10-06T11:00:00Z" },
  { interviewerId: "rayan", start: "2026-10-06T10:30:00Z", end: "2026-10-06T11:15:00Z" },
];

describe("slotState", () => {
  it("is free when nobody on the panel overlaps", () => {
    expect(slotState(new Date("2026-10-06T12:00:00Z"), 60, ["alice", "rayan"], busy, NOW)).toEqual({ kind: "free" });
  });

  it("treats back-to-back as free: a booking ending at the start does not clash", () => {
    expect(slotState(new Date("2026-10-06T11:15:00Z"), 60, ["alice", "rayan"], busy, NOW)).toEqual({ kind: "free" });
  });

  it("names who is busy when only part of the panel is", () => {
    expect(slotState(new Date("2026-10-06T09:30:00Z"), 60, ["alice", "rayan"], busy, NOW)).toEqual({
      kind: "partial",
      busy: ["alice"],
    });
  });

  it("is booked when every interviewer clashes", () => {
    expect(slotState(new Date("2026-10-06T10:00:00Z"), 60, ["alice", "rayan"], busy, NOW)).toEqual({ kind: "booked" });
  });

  it("ignores bookings of people not on this panel", () => {
    expect(slotState(new Date("2026-10-06T10:00:00Z"), 60, ["jonas"], busy, NOW)).toEqual({ kind: "free" });
  });

  it("never offers a slot that has already started", () => {
    expect(slotState(new Date("2026-10-05T07:00:00Z"), 60, ["jonas"], [], NOW)).toEqual({ kind: "past" });
  });
});

describe("localWeekStart", () => {
  it("returns the Monday at local midnight", () => {
    const start = localWeekStart(new Date(2026, 9, 8, 15, 30)); // Thursday 8 Oct
    expect(start.getDay()).toBe(1);
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([5, 0, 0]);
  });

  it("keeps a Sunday in the week that started six days earlier", () => {
    expect(localWeekStart(new Date(2026, 9, 11, 9)).getDate()).toBe(5);
  });
});
