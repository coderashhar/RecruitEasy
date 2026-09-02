import { describe, test, expect } from "vitest";
import { localDateTimeToIso } from "./scheduled-at-field.js";

describe("localDateTimeToIso", () => {
  test("converts using the runtime's own local timezone, not a fixed offset", () => {
    // The whole point of doing this conversion client-side: the same raw
    // datetime-local string must resolve to a different UTC instant
    // depending on which timezone parses it — that's the bug being avoided
    // by never letting the *server's* timezone parse the raw string at all.
    const originalTz = process.env.TZ;

    process.env.TZ = "UTC";
    const utc = localDateTimeToIso("2026-10-01T14:30");

    process.env.TZ = "Asia/Kolkata"; // UTC+5:30
    const ist = localDateTimeToIso("2026-10-01T14:30");

    process.env.TZ = originalTz;

    expect(utc).toBe("2026-10-01T14:30:00.000Z");
    expect(ist).toBe("2026-10-01T09:00:00.000Z");
    expect(utc).not.toBe(ist);
  });

  test("empty input stays empty rather than becoming 'Invalid Date'", () => {
    expect(localDateTimeToIso("")).toBe("");
  });
});
