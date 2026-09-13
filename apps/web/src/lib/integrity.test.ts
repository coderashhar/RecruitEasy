import { describe, expect, test } from "vitest";
import { describeIntegritySignal } from "./integrity.js";

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
