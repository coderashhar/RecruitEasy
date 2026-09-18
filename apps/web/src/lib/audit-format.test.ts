import { describe, expect, it } from "vitest";
import { describeAuditAction, formatAuditMeta } from "./audit-format";

const sentence = (action: string, meta?: unknown) =>
  describeAuditAction(action, meta)
    .parts.map((part) => part.text)
    .join("");

describe("describeAuditAction", () => {
  it("names both ends of a status change in words", () => {
    const result = describeAuditAction("application.status_changed", { from: "INTERVIEWING", to: "OFFER" });
    expect(result.parts.map((part) => part.text).join("")).toBe("Moved an application from Interviewing to Offer");
    expect(result.parts.filter((part) => part.strong).map((part) => part.text)).toEqual(["Interviewing", "Offer"]);
  });

  it("counts what a data deletion removed", () => {
    expect(sentence("privacy.data_deleted", { applications: 3, files: 1 })).toBe(
      "Deleted a candidate's data · 3 applications, 1 file",
    );
  });

  it("falls back to a generic sentence when meta is missing or malformed", () => {
    expect(sentence("application.status_changed", null)).toBe("Changed an application's status");
    expect(sentence("interview.status_changed", ["not", "an", "object"])).toBe("Changed an interview's status");
  });

  it("shows an unknown action by its machine name rather than guessing", () => {
    expect(sentence("billing.plan_changed", { plan: "pro" })).toBe("billing.plan_changed");
  });
});

describe("observer audit sentences", () => {
  it("reads observers off a scheduling row and names add and remove", () => {
    expect(sentence("interview.scheduled", { interviewerIds: ["a"], observerIds: ["b", "c"] })).toBe(
      "Scheduled an interview · 1 interviewer, 2 observers",
    );
    expect(sentence("interview.scheduled", { interviewerIds: ["a"], observerIds: [] })).toBe(
      "Scheduled an interview · 1 interviewer",
    );
    expect(sentence("interview.observer_added")).toBe("Added an observer to an interview");
    expect(sentence("interview.observer_removed")).toBe("Removed an observer from an interview");
  });
});

describe("formatAuditMeta", () => {
  it("renders key=value pairs and collapses arrays to a length", () => {
    expect(formatAuditMeta({ applicationId: "app_1", interviewerIds: ["a", "b"] })).toBe(
      "applicationId=app_1 interviewerIds=2",
    );
  });

  it("is empty for no meta", () => {
    expect(formatAuditMeta(null)).toBe("");
  });

  it("truncates long values", () => {
    expect(formatAuditMeta({ note: "x".repeat(300) }, 20)).toHaveLength(21);
  });
});
