import { describe, expect, test } from "vitest";
import { buildIcs, parseMailbox, type IcsEventInput } from "./ics.js";

function event(overrides: Partial<IcsEventInput> = {}): IcsEventInput {
  return {
    uid: "interview_abc@interviewhub",
    sequence: 0,
    method: "REQUEST",
    start: new Date("2026-10-01T10:00:00Z"),
    durationMins: 45,
    summary: "Interview: Backend Engineer",
    description: "Join the room at the link.",
    url: "https://app.example.com/interview/abc",
    organizer: { name: "InterviewHub AI", email: "noreply@example.com" },
    attendees: [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ],
    now: new Date("2026-09-13T08:00:00Z"),
    ...overrides,
  };
}

/** Unfolds continuation lines so assertions don't depend on where folding split. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("buildIcs", () => {
  test("times are exact UTC instants, and DTEND is start plus duration", () => {
    const lines = unfold(buildIcs(event()));

    expect(lines).toContain("DTSTART:20261001T100000Z");
    expect(lines).toContain("DTEND:20261001T104500Z");
    expect(lines).toContain("DTSTAMP:20260913T080000Z");
  });

  test("a request is a confirmed invite to every attendee", () => {
    const lines = unfold(buildIcs(event()));

    expect(lines).toContain("METHOD:REQUEST");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("UID:interview_abc@interviewhub");
    expect(lines.filter((line) => line.startsWith("ATTENDEE"))).toHaveLength(2);
    expect(lines.some((line) => line.endsWith(":mailto:alice@example.com"))).toBe(true);
    expect(lines).toContain('ORGANIZER;CN="InterviewHub AI":mailto:noreply@example.com');
  });

  // A calendar only applies a cancellation carrying the same UID and a
  // SEQUENCE at least as high as the copy it holds.
  test("a cancellation keeps the UID, carries the sequence and marks the event cancelled", () => {
    const lines = unfold(buildIcs(event({ method: "CANCEL", sequence: 3 })));

    expect(lines).toContain("METHOD:CANCEL");
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain("SEQUENCE:3");
    expect(lines).toContain("UID:interview_abc@interviewhub");
    expect(lines).toContain("SUMMARY:Cancelled: Interview: Backend Engineer");
  });

  test("text values escape the characters iCalendar reserves", () => {
    const lines = unfold(
      buildIcs(event({ summary: "Interview: C++, Go; Rust", description: "Line one\nback\\slash" })),
    );

    expect(lines).toContain("SUMMARY:Interview: C++\\, Go\\; Rust");
    expect(lines).toContain("DESCRIPTION:Line one\\nback\\\\slash");
  });

  test("uses CRLF line endings and folds every line to 75 octets, never inside a character", () => {
    const ics = buildIcs(
      event({ description: "é".repeat(120), attendees: [{ name: "José Álvarez", email: "jose@example.com" }] }),
    );

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");

    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolding restores the value intact — no character was cut in half.
    expect(unfold(ics)).toContain(`DESCRIPTION:${"é".repeat(120)}`);
  });

  test("a quote in a display name cannot break out of its parameter", () => {
    const lines = unfold(buildIcs(event({ attendees: [{ name: 'Al "the pal"', email: "al@example.com" }] })));

    expect(lines.find((line) => line.startsWith("ATTENDEE"))).toContain('CN="Al the pal"');
  });
});

describe("parseMailbox", () => {
  test("splits a display name from its address", () => {
    expect(parseMailbox("InterviewHub AI <noreply@example.com>")).toEqual({
      name: "InterviewHub AI",
      email: "noreply@example.com",
    });
  });

  test("a bare address is its own name", () => {
    expect(parseMailbox("noreply@example.com")).toEqual({
      name: "noreply@example.com",
      email: "noreply@example.com",
    });
  });
});
