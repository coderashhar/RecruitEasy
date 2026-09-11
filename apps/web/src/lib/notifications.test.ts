import { describe, test, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createNotification = vi.fn();
const findManyNotification = vi.fn();
const countNotification = vi.fn();
const updateManyNotification = vi.fn();

vi.mock("@interviewhub/db", () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => createNotification(...args),
      findMany: (...args: unknown[]) => findManyNotification(...args),
      count: (...args: unknown[]) => countNotification(...args),
      updateMany: (...args: unknown[]) => updateManyNotification(...args),
    },
  },
}));

const mockSendEmail = vi.fn();
vi.mock("./email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const {
  notifyUser,
  getUnreadNotifications,
  getUnreadCount,
  markNotificationsRead,
  markAllNotificationsRead,
} = await import("./notifications.js");

const USER_ID = "user_1";

beforeEach(() => {
  createNotification.mockReset();
  findManyNotification.mockReset();
  countNotification.mockReset();
  updateManyNotification.mockReset();
  mockSendEmail.mockReset();
  createNotification.mockResolvedValue({ id: "notif_1" });
  mockSendEmail.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// notifyUser
// ---------------------------------------------------------------------------

describe("notifyUser", () => {
  test("creates a notification row with the given fields", async () => {
    await notifyUser(USER_ID, {
      type: "status_change",
      title: "Application update",
      body: "Your application status changed.",
      link: "/candidate",
    });

    expect(createNotification).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        type: "status_change",
        title: "Application update",
        body: "Your application status changed.",
        link: "/candidate",
      },
    });
  });

  test("sends an email when email options are provided", async () => {
    await notifyUser(USER_ID, {
      type: "interview_scheduled",
      title: "Interview scheduled",
      body: "Your interview is scheduled.",
      email: {
        to: "candidate@example.com",
        subject: "Interview scheduled",
        text: "Your interview is scheduled.",
        html: "<p>Your interview is scheduled.</p>",
      },
    });

    expect(mockSendEmail).toHaveBeenCalledWith({
      to: "candidate@example.com",
      subject: "Interview scheduled",
      text: "Your interview is scheduled.",
      html: "<p>Your interview is scheduled.</p>",
    });
  });

  test("does not send email when email options are omitted", async () => {
    await notifyUser(USER_ID, {
      type: "generic",
      title: "Hello",
      body: "World",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("does not throw when the DB write fails", async () => {
    createNotification.mockRejectedValue(new Error("DB down"));

    await expect(
      notifyUser(USER_ID, {
        type: "generic",
        title: "Test",
        body: "Body",
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

describe("getUnreadNotifications", () => {
  test("queries unread notifications for the user, most recent first", async () => {
    findManyNotification.mockResolvedValue([]);

    await getUnreadNotifications(USER_ID);

    expect(findManyNotification).toHaveBeenCalledWith({
      where: { userId: USER_ID, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  test("respects custom limit", async () => {
    findManyNotification.mockResolvedValue([]);

    await getUnreadNotifications(USER_ID, 5);

    expect(findManyNotification).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
});

describe("getUnreadCount", () => {
  test("counts unread notifications for the user", async () => {
    countNotification.mockResolvedValue(3);

    const result = await getUnreadCount(USER_ID);

    expect(result).toBe(3);
    expect(countNotification).toHaveBeenCalledWith({
      where: { userId: USER_ID, readAt: null },
    });
  });
});

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

describe("markNotificationsRead", () => {
  test("marks specific notifications as read, scoped to the user", async () => {
    await markNotificationsRead(USER_ID, ["notif_1", "notif_2"]);

    expect(updateManyNotification).toHaveBeenCalledWith({
      where: { id: { in: ["notif_1", "notif_2"] }, userId: USER_ID },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("markAllNotificationsRead", () => {
  test("marks all unread notifications as read for the user", async () => {
    await markAllNotificationsRead(USER_ID);

    expect(updateManyNotification).toHaveBeenCalledWith({
      where: { userId: USER_ID, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
