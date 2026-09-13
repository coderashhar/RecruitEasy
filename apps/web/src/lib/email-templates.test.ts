import { describe, test, expect } from "vitest";

const { applicationStatusEmail, genericNotificationEmail, interviewNoticeEmail } = await import(
  "./email-templates.js"
);

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

describe("interviewNoticeEmail", () => {
  const base = {
    recipientName: "Alice",
    recipientIsCandidate: true,
    candidateName: "Alice",
    jobTitle: "Backend Engineer",
    scheduledAt: new Date("2026-09-15T10:00:00Z"),
    durationMins: 60,
    joinUrl: "https://app.example.com/interview/abc",
  };

  test("an invite includes job title, duration and join link", () => {
    const result = interviewNoticeEmail({ ...base, kind: "scheduled" });

    expect(result.subject).toBe("Interview scheduled — Backend Engineer");
    expect(result.html).toContain("Backend Engineer");
    expect(result.html).toContain("60 minutes");
    expect(result.html).toContain("https://app.example.com/interview/abc");
    expect(result.text).toContain("https://app.example.com/interview/abc");
  });

  // Rendered on a UTC server with no idea where the reader is, so the time
  // must say which zone it is in rather than pass as the reader's local time.
  test("the time is labelled with its time zone", () => {
    const result = interviewNoticeEmail({ ...base, kind: "scheduled" });

    expect(result.text).toContain("Tuesday, September 15, 2026 at 10:00 AM UTC");
  });

  test("an interviewer is told who the interview is with", () => {
    const result = interviewNoticeEmail({
      ...base,
      kind: "scheduled",
      recipientName: "Bob",
      recipientIsCandidate: false,
    });

    expect(result.text).toContain("Hi Bob");
    expect(result.text).toContain("Your interview with Alice for Backend Engineer");
  });

  test("a reschedule and a reminder say so in the subject", () => {
    expect(interviewNoticeEmail({ ...base, kind: "rescheduled" }).subject).toContain("rescheduled");
    expect(
      interviewNoticeEmail({ ...base, kind: "reminder", startsIn: "in 1 hour" }).subject,
    ).toBe("Reminder: interview in 1 hour — Backend Engineer");
  });

  test("a cancellation offers no join link", () => {
    const result = interviewNoticeEmail({ ...base, kind: "cancelled" });

    expect(result.subject).toContain("cancelled");
    expect(result.html).not.toContain(base.joinUrl);
    expect(result.text).not.toContain(base.joinUrl);
  });

  test("names are escaped in HTML", () => {
    const result = interviewNoticeEmail({
      ...base,
      kind: "scheduled",
      recipientIsCandidate: false,
      candidateName: "<script>x</script>",
    });

    expect(result.html).not.toContain("<script>");
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
