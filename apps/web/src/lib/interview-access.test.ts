import { describe, test, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@interviewhub/db", () => ({
  prisma: { interviewParticipant: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { authorizeInterviewAccess } = await import("./interview-access.js");

beforeEach(() => {
  findUnique.mockReset();
});

describe("authorizeInterviewAccess", () => {
  test("participant row exists -> the interview and the caller's own role", async () => {
    findUnique.mockResolvedValue({
      role: "INTERVIEWER",
      interview: { id: "interview_1", roomName: "interview_abc" },
    });

    const access = await authorizeInterviewAccess("interview_1", "user_1");

    expect(access).toEqual({
      interview: { id: "interview_1", roomName: "interview_abc" },
      participantRole: "INTERVIEWER",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { interviewId_userId: { interviewId: "interview_1", userId: "user_1" } },
      include: { interview: true },
    });
  });

  // This is the actual security boundary: someone signed in but not on the
  // guest list for this interview must be refused, and refused with a value
  // that lets the page 404 rather than reveal the interview exists at all.
  test("no participant row -> null, not a thrown error", async () => {
    findUnique.mockResolvedValue(null);

    await expect(authorizeInterviewAccess("interview_1", "user_2")).resolves.toBeNull();
  });
});
