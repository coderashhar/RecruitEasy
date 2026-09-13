import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — Resend is imported at module scope, so mock before import.
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: (...args: unknown[]) => mockSend(...args) };
    },
  };
});

// Set the env var before importing so the module creates a Resend instance.
vi.stubEnv("RESEND_API_KEY", "re_test_key");

const { sendEmail } = await import("./email.js");

beforeEach(() => {
  mockSend.mockReset();
});

describe("sendEmail", () => {
  test("sends email via Resend and returns true on success", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Test",
      }),
    );
  });

  test("returns false when Resend reports an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Bad request" } });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(result).toBe(false);
  });

  test("returns false and does not throw when send throws", async () => {
    mockSend.mockRejectedValue(new Error("Network error"));

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "Hello",
    });

    expect(result).toBe(false);
  });

  test("passes attachments through to Resend", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_2" }, error: null });

    await sendEmail({
      to: "bob@example.com",
      subject: "Invite",
      text: "See attached.",
      attachments: [{ filename: "invite.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" }],
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: "invite.ics", content: "BEGIN:VCALENDAR", contentType: "text/calendar" }],
      }),
    );
  });
});
