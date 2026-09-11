import { describe, test, expect } from "vitest";

const {
  applicationStatusEmail,
  interviewScheduledEmail,
  interviewRescheduledEmail,
  genericNotificationEmail,
} = await import("./email-templates.js");

describe("applicationStatusEmail", () => {
  test("returns email content for each known status", () => {
    for (const status of ["SCREENING", "INTERVIEWING", "OFFER", "HIRED", "REJECTED"]) {
      const result = applicationStatusEmail("Alice", "Backend Engineer", status);
      expect(result).not.toBeNull();
      expect(result!.subject).toBeTruthy();
      expect(result!.html).toContain("Backend Engineer");
      expect(result!.text).toContain("Alice");
    }
  });

  test("returns null for unknown status", () => {
    expect(applicationStatusEmail("Alice", "Job", "APPLIED")).toBeNull();
  });

  test("REJECTED email has empathetic tone", () => {
    const result = applicationStatusEmail("Bob", "Frontend Dev", "REJECTED")!;
    expect(result.subject).toBe("Update on your application");
    expect(result.text).toContain("decided not to proceed");
  });

  test("OFFER email is congratulatory", () => {
    const result = applicationStatusEmail("Carol", "SRE", "OFFER")!;
    expect(result.subject).toContain("Congratulations");
  });
});

describe("interviewScheduledEmail", () => {
  const date = new Date("2026-09-15T10:00:00Z");

  test("includes job title, date, and join link", () => {
    const result = interviewScheduledEmail(
      "Alice",
      "Backend Engineer",
      date,
      60,
      "https://app.example.com/interview/abc",
    );

    expect(result.subject).toContain("Backend Engineer");
    expect(result.html).toContain("Backend Engineer");
    expect(result.html).toContain("60 minutes");
    expect(result.html).toContain("https://app.example.com/interview/abc");
    expect(result.text).toContain("https://app.example.com/interview/abc");
  });
});

describe("interviewRescheduledEmail", () => {
  test("subject says rescheduled, not scheduled", () => {
    const result = interviewRescheduledEmail(
      "Alice",
      "Backend Engineer",
      new Date("2026-09-16T14:00:00Z"),
      45,
      "https://app.example.com/interview/abc",
    );

    expect(result.subject).toContain("rescheduled");
  });
});

describe("genericNotificationEmail", () => {
  test("includes action button when url and label provided", () => {
    const result = genericNotificationEmail(
      "Alice",
      "New message",
      "You have a new message.",
      "https://app.example.com/messages",
      "View messages",
    );

    expect(result.html).toContain("View messages");
    expect(result.html).toContain("https://app.example.com/messages");
    expect(result.text).toContain("View messages");
  });

  test("omits action button when no url", () => {
    const result = genericNotificationEmail("Bob", "Welcome", "Welcome to the platform.");

    expect(result.html).not.toContain("inline-block");
  });
});
