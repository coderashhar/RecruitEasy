import { describe, expect, test } from "vitest";
import { supportedLanguageSchema } from "@interviewhub/types";
import { PRACTICE_PROBLEMS, STARTER_CODE, outputMatches } from "./practice-problems.js";

describe("outputMatches", () => {
  test("ignores trailing spaces and the final newline print() adds", () => {
    expect(outputMatches("blue is sky the  \n", "blue is sky the")).toBe(true);
    expect(outputMatches("1\r\n2\r\nFizz\r\n\r\n", "1\n2\nFizz")).toBe(true);
  });

  test("anything else must match exactly", () => {
    expect(outputMatches("blue is sky  the", "blue is sky the")).toBe(false);
    expect(outputMatches(" 0 1", "0 1")).toBe(false);
    expect(outputMatches("True", "true")).toBe(false);
  });

  test("no output never matches", () => {
    expect(outputMatches(null, "")).toBe(false);
  });
});

describe("practice content", () => {
  test("every supported language has a starter file", () => {
    for (const language of supportedLanguageSchema.options) {
      expect(STARTER_CODE[language]).toBeTruthy();
    }
  });

  test("problem ids are unique, and each has a sample to check against", () => {
    const ids = PRACTICE_PROBLEMS.map((problem) => problem.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const problem of PRACTICE_PROBLEMS) {
      expect(problem.sampleInput).not.toBe("");
      expect(problem.sampleOutput).not.toBe("");
    }
  });
});
