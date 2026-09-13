import { describe, test, expect, vi, beforeEach } from "vitest";

const findUniqueInterview = vi.fn();
const notifyUser = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: { interview: { findUnique: (...args: unknown[]) => findUniqueInterview(...args) } },
}));

vi.mock("./notifications", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

vi.mock("./email", () => ({
  emailFromAddress: () => "InterviewHub AI <noreply@example.com>",
}));

vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

const { sendInterviewInvites } = await import("./interview-notices.js");

const INTERVIEW = {
  id: "interview_1",
  roomName: "interview_room_1",
  scheduledAt: new Date("2026-10-01T10:00:00Z"),
  durationMins: 45,
  icsSequence: 2,
  application: {
    candidate: { name: "Alice" },
    job: { title: "Backend Engineer" },
  },
  participants: [
    { role: "CANDIDATE", user: { id: "user_alice", name: "Alice", email: "alice@example.com" } },
    { role: "INTERVIEWER", user: { id: "user_bob", name: "Bob", email: "bob@example.com" } },
  ],
};

type NotifyCall = [
  string,
  {
    type: string;
    link?: string;
    email: {
      to: string;
      text: string;
      attachments?: Array<{ filename: string; content: string; contentType: string }>;
    };
  },
];

function callFor(userId: string): NotifyCall[1] {
  const call = (notifyUser.mock.calls as NotifyCall[]).find(([id]) => id === userId);
  if (!call) throw new Error(`no notification for ${userId}`);
  return call[1];
}

beforeEach(() => {
  findUniqueInterview.mockReset().mockResolvedValue(INTERVIEW);
  notifyUser.mockReset().mockResolvedValue(undefined);
});

describe("sendInterviewInvites", () => {
  // Interviewers used to receive nothing at all when an interview was booked.
  test("every participant is notified, each in their own terms", async () => {
    await sendInterviewInvites("interview_1", "scheduled");

    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect(callFor("user_alice").email.to).toBe("alice@example.com");
    expect(callFor("user_alice").email.text).toContain("Your interview for Backend Engineer");
    expect(callFor("user_bob").email.to).toBe("bob@example.com");
    expect(callFor("user_bob").email.text).toContain("Your interview with Alice for Backend Engineer");
    expect(callFor("user_bob").link).toBe("/interview/interview_1");
  });

  test("each email carries the same calendar request, with the interview's current sequence", async () => {
    await sendInterviewInvites("interview_1", "rescheduled");

    const [aliceIcs, bobIcs] = ["user_alice", "user_bob"].map(
      (id) => callFor(id).email.attachments?.[0],
    );
    expect(aliceIcs).toMatchObject({
      filename: "invite.ics",
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
    expect(aliceIcs?.content).toBe(bobIcs?.content);

    const ics = aliceIcs!.content.replace(/\r\n /g, "");
    expect(ics).toContain("UID:interview_room_1@interviewhub");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("DTSTART:20261001T100000Z");
    expect(ics).toContain("mailto:alice@example.com");
    expect(ics).toContain("mailto:bob@example.com");
  });

  test("a cancellation sends METHOD:CANCEL and links nowhere", async () => {
    await sendInterviewInvites("interview_1", "cancelled");

    const notice = callFor("user_alice");
    expect(notice.type).toBe("interview.cancelled");
    expect(notice.link).toBeUndefined();
    expect(notice.email.attachments?.[0].contentType).toContain("method=CANCEL");
    expect(notice.email.attachments?.[0].content).toContain("METHOD:CANCEL");
  });

  test("never throws — a failed notice must not fail the scheduling action", async () => {
    findUniqueInterview.mockRejectedValue(new Error("DB down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendInterviewInvites("interview_1", "scheduled")).resolves.toBeUndefined();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  test("an interview that no longer exists sends nothing", async () => {
    findUniqueInterview.mockResolvedValue(null);

    await sendInterviewInvites("interview_1", "scheduled");
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
