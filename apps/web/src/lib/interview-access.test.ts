import { describe, test, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@interviewhub/db", () => ({
  prisma: { interviewParticipant: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { authorizeInterviewAccess } = await import("./interview-access.js");

function participantRow() {
  return {
    role: "INTERVIEWER",
    interview: {
      id: "interview_1",
      roomName: "interview_abc",
      application: {
        job: { title: "Backend Engineer" },
        candidate: { name: "Alice Applicant" },
      },
      participants: [
        { role: "CANDIDATE", user: { id: "user_alice", name: "Alice Applicant" } },
        { role: "INTERVIEWER", user: { id: "user_1", name: "Ivan Interviewer" } },
      ],
    },
  };
}

beforeEach(() => {
  findUnique.mockReset();
});

describe("authorizeInterviewAccess", () => {
  test("participant row exists -> the interview and the caller's own role", async () => {
    findUnique.mockResolvedValue(participantRow());

    const access = await authorizeInterviewAccess("interview_1", "user_1");

    expect(access).toMatchObject({
      interview: { id: "interview_1", roomName: "interview_abc" },
      participantRole: "INTERVIEWER",
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { interviewId_userId: { interviewId: "interview_1", userId: "user_1" } },
      }),
    );
  });

  // The nested relations are stripped off the returned `interview` rather than
  // passed through: it is handed to mintInterviewToken and rendered as props,
  // and leaking the whole object graph into both would be easy to do by
  // accident and hard to notice.
  test("returns a plain interview, with context lifted out alongside it", async () => {
    findUnique.mockResolvedValue(participantRow());

    const access = await authorizeInterviewAccess("interview_1", "user_1");

    expect(access?.jobTitle).toBe("Backend Engineer");
    expect(access?.candidateName).toBe("Alice Applicant");
    expect(access?.interview).not.toHaveProperty("application");
    expect(access?.interview).not.toHaveProperty("participants");
  });

  // The room resolves ids to names through this: presence and chat both
  // arrive from the realtime service carrying only a userId, so without a
  // roster the UI can only show raw database ids.
  test("roster carries every invited participant, connected or not", async () => {
    findUnique.mockResolvedValue(participantRow());

    const access = await authorizeInterviewAccess("interview_1", "user_1");

    expect(access?.roster).toEqual([
      { userId: "user_alice", name: "Alice Applicant", role: "CANDIDATE" },
      { userId: "user_1", name: "Ivan Interviewer", role: "INTERVIEWER" },
    ]);
  });

  // This is the actual security boundary: someone signed in but not on the
  // guest list for this interview must be refused, and refused with a value
  // that lets the page 404 rather than reveal the interview exists at all.
  test("no participant row -> null, not a thrown error", async () => {
    findUnique.mockResolvedValue(null);

    await expect(authorizeInterviewAccess("interview_1", "user_2")).resolves.toBeNull();
  });
});
