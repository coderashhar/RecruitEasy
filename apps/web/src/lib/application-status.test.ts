import { describe, expect, test } from "vitest";
import { classifyStatusChange, isFinalApplicationStatus } from "./application-status";

describe("classifyStatusChange", () => {
  test("the same status is no change at all", () => {
    expect(classifyStatusChange("SCREENING", "SCREENING")).toBe("unchanged");
    expect(classifyStatusChange("REJECTED", "REJECTED")).toBe("unchanged");
  });

  test("moves between open stages are free, in either direction", () => {
    expect(classifyStatusChange("APPLIED", "INTERVIEWING")).toBe("move");
    expect(classifyStatusChange("INTERVIEWING", "SCREENING")).toBe("move");
  });

  test("reaching a decision is a move", () => {
    expect(classifyStatusChange("OFFER", "HIRED")).toBe("move");
    expect(classifyStatusChange("APPLIED", "REJECTED")).toBe("move");
  });

  test("leaving a decision is an overturn, whatever it goes to", () => {
    expect(classifyStatusChange("REJECTED", "INTERVIEWING")).toBe("overturn");
    expect(classifyStatusChange("HIRED", "APPLIED")).toBe("overturn");
    expect(classifyStatusChange("HIRED", "REJECTED")).toBe("overturn");
  });
});

describe("isFinalApplicationStatus", () => {
  test("only HIRED and REJECTED", () => {
    expect(isFinalApplicationStatus("HIRED")).toBe(true);
    expect(isFinalApplicationStatus("REJECTED")).toBe(true);
    expect(isFinalApplicationStatus("OFFER")).toBe(false);
  });
});
