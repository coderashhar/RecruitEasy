import { describe, test, expect, vi, beforeEach } from "vitest";

const findUniqueInterview = vi.fn();
const findManyInterview = vi.fn();
const updateManyInterview = vi.fn();
const notifyUser = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    interview: {
      findUnique: (...args: unknown[]) => findUniqueInterview(...args),
      findMany: (...args: unknown[]) => findManyInterview(...args),
      updateMany: (...args: unknown[]) => updateManyInterview(...args),
    },
  },
}));

vi.mock("./notifications", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

vi.mock("./email", () => ({
  emailFromAddress: () => "InterviewHub AI <noreply@example.com>",
}));

vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");

const { sendInterviewInvites, sendDueReminders, dueReminder, formatStartsIn } = await import(
  "./interview-notices.js"
);

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
  findManyInterview.mockReset().mockResolvedValue([]);
  updateManyInterview.mockReset().mockResolvedValue({ count: 1 });
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

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-01T09:00:00Z");

function upcoming(msUntil: number, overrides: Record<string, unknown> = {}) {
  const scheduledAt = new Date(NOW.getTime() + msUntil);
  return {
    id: "interview_1",
    scheduledAt,
    // Booked a week ahead unless a test says otherwise.
    updatedAt: new Date(scheduledAt.getTime() - 7 * 24 * HOUR),
    reminder24hSentAt: null,
    reminder1hSentAt: null,
    ...overrides,
  };
}

describe("dueReminder", () => {
  test("the day before, an interview booked well ahead gets the 24h reminder", () => {
    expect(dueReminder(upcoming(23 * HOUR), NOW)).toBe("24h");
  });

  test("in the final hour, the 1h reminder", () => {
    expect(dueReminder(upcoming(50 * 60 * 1000), NOW)).toBe("1h");
  });

  test("more than a day out, or already started, nothing", () => {
    expect(dueReminder(upcoming(25 * HOUR), NOW)).toBeNull();
    expect(dueReminder(upcoming(-5 * 60 * 1000), NOW)).toBeNull();
  });

  test("a reminder already sent is not sent again", () => {
    expect(dueReminder(upcoming(23 * HOUR, { reminder24hSentAt: NOW }), NOW)).toBeNull();
    expect(dueReminder(upcoming(30 * 60 * 1000, { reminder1hSentAt: NOW }), NOW)).toBeNull();
  });

  // Booked this afternoon for tomorrow morning: the invite just arrived, so a
  // "tomorrow" reminder on top of it is noise. The 1h reminder still comes.
  test("an interview booked less than a day ahead skips the day-ahead reminder", () => {
    const bookedRecently = { updatedAt: new Date(NOW.getTime() - HOUR) };
    expect(dueReminder(upcoming(20 * HOUR, bookedRecently), NOW)).toBeNull();
    expect(dueReminder(upcoming(40 * 60 * 1000, bookedRecently), NOW)).toBe("1h");
  });

  // A missed day-ahead window is not made up late as a second reminder.
  test("in the final hour with the 24h reminder never sent, only the 1h one is due", () => {
    expect(dueReminder(upcoming(30 * 60 * 1000), NOW)).toBe("1h");
  });
});

describe("formatStartsIn", () => {
  test("minutes under 90 minutes, hours after", () => {
    expect(formatStartsIn(55 * 60 * 1000)).toBe("in 55 minutes");
    expect(formatStartsIn(30 * 1000)).toBe("in 1 minute");
    expect(formatStartsIn(24 * HOUR)).toBe("in 24 hours");
  });
});

describe("sendDueReminders", () => {
  test("claims the reminder with a conditional update, then notifies every participant", async () => {
    const due = upcoming(50 * 60 * 1000);
    findManyInterview.mockResolvedValue([due]);

    await expect(sendDueReminders(NOW)).resolves.toEqual({ sent: 1 });

    // Status and time are pinned so a reschedule between read and claim
    // matches nothing instead of reminding people about the old time.
    expect(updateManyInterview).toHaveBeenCalledWith({
      where: {
        id: "interview_1",
        status: "SCHEDULED",
        scheduledAt: due.scheduledAt,
        reminder1hSentAt: null,
      },
      data: { reminder1hSentAt: NOW },
    });
    expect(notifyUser).toHaveBeenCalledTimes(2);
    const notice = callFor("user_bob");
    expect(notice.type).toBe("interview.reminder");
    // A reminder is not a new invite: no calendar attachment.
    expect(notice.email.attachments).toBeUndefined();
  });

  // Two overlapping sweeps both read the interview; only one claim matches.
  test("a claim another run already made sends nothing", async () => {
    findManyInterview.mockResolvedValue([upcoming(50 * 60 * 1000)]);
    updateManyInterview.mockResolvedValue({ count: 0 });

    await expect(sendDueReminders(NOW)).resolves.toEqual({ sent: 0 });
    expect(notifyUser).not.toHaveBeenCalled();
  });

  test("an interview with nothing due is neither claimed nor notified", async () => {
    findManyInterview.mockResolvedValue([upcoming(20 * HOUR, { reminder24hSentAt: NOW })]);

    await sendDueReminders(NOW);
    expect(updateManyInterview).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  test("one failed delivery doesn't stop the rest of the sweep", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findManyInterview.mockResolvedValue([
      upcoming(50 * 60 * 1000, { id: "interview_broken" }),
      upcoming(40 * 60 * 1000, { id: "interview_1" }),
    ]);
    findUniqueInterview
      .mockRejectedValueOnce(new Error("DB blip"))
      .mockResolvedValueOnce(INTERVIEW);

    await expect(sendDueReminders(NOW)).resolves.toEqual({ sent: 1 });
  });
});
