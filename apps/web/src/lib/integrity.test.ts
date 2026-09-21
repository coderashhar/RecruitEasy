import { describe, expect, test } from "vitest";
import { describeIntegritySignal, summarizeIntegritySignals } from "./integrity.js";

describe("describeIntegritySignal", () => {
  test("a paste carries its length, never its content", () => {
    expect(describeIntegritySignal("PASTE", { length: 1240 })).toBe(
      "Pasted into the editor (1,240 characters)",
    );
    expect(describeIntegritySignal("PASTE", { length: 1 })).toBe("Pasted into the editor (1 character)");
  });

  // Rows written before the payload existed have none; they must still read.
  test("a paste without a payload falls back to the plain label", () => {
    expect(describeIntegritySignal("PASTE", null)).toBe("Pasted into the editor");
  });

  test("other signals use their label", () => {
    expect(describeIntegritySignal("FULLSCREEN_EXIT", null)).toBe("Left full screen");
  });
});

describe("summarizeIntegritySignals", () => {
  test("totals the counts and labels each type", () => {
    const summary = summarizeIntegritySignals([
      { type: "PASTE", count: 3 },
      { type: "TAB_BLUR", count: 412 },
    ]);
    expect(summary.total).toBe(415);
    // Label order, not input order, so the line reads the same on every visit.
    expect(summary.byType).toEqual([
      { type: "TAB_BLUR", label: "Switched away from the tab", count: 412 },
      { type: "PASTE", label: "Pasted into the editor", count: 3 },
    ]);
  });

  test("leaves out types with no signals", () => {
    const summary = summarizeIntegritySignals([
      { type: "FULLSCREEN_EXIT", count: 0 },
      { type: "PASTE", count: 1 },
    ]);
    expect(summary.byType.map((entry) => entry.type)).toEqual(["PASTE"]);
  });

  test("is zero for an interview with none", () => {
    expect(summarizeIntegritySignals([])).toEqual({ total: 0, byType: [] });
  });
});
