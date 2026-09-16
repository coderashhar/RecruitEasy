import { describe, expect, it } from "vitest";
import { parseResumeIssue, RESUME_ISSUES, resumeIssueCopy } from "./resume-availability";

describe("parseResumeIssue", () => {
  it("accepts the reasons the download route sends", () => {
    for (const issue of RESUME_ISSUES) {
      expect(parseResumeIssue(issue)).toBe(issue);
    }
  });

  it("takes the first value when the param repeats", () => {
    expect(parseResumeIssue(["unavailable", "none"])).toBe("unavailable");
  });

  it("ignores anything else, so a hand-edited URL can't inject copy", () => {
    expect(parseResumeIssue("<script>")).toBeNull();
    expect(parseResumeIssue("unconfigured")).toBeNull();
    expect(parseResumeIssue(undefined)).toBeNull();
  });
});

describe("resumeIssueCopy", () => {
  it("separates 'never uploaded' from 'cannot be opened'", () => {
    expect(resumeIssueCopy("none").title).not.toBe(resumeIssueCopy("unavailable").title);
  });

  it("keeps operator detail out of what a recruiter reads", () => {
    for (const issue of RESUME_ISSUES) {
      const { title, detail } = resumeIssueCopy(issue);
      expect(`${title} ${detail}`).not.toMatch(/R2_|env|variable|bucket|configure|restart|storage/i);
      // Short enough to read in one glance, not a paragraph of infrastructure.
      expect(detail.length).toBeLessThanOrEqual(120);
    }
  });
});
