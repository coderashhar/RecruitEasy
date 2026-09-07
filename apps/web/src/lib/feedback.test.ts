import { describe, test, expect, vi, beforeEach } from "vitest";
import { submitFeedbackSchema } from "@interviewhub/types";

const findUniqueParticipant = vi.fn();
const upsertFeedback = vi.fn();

vi.mock("@interviewhub/db", () => ({
  Prisma: {},
  prisma: {
    interviewParticipant: { findUnique: (...args: unknown[]) => findUniqueParticipant(...args) },
    feedback: { upsert: (...args: unknown[]) => upsertFeedback(...args) },
  },
}));

const { submitFeedback, FeedbackError } = await import("./feedback.js");

const INTERVIEWER_ID = "user_interviewer";
const input = {
  interviewId: "interview_1",
  rubricScores: { coding: 4, problemSolving: 3, communication: 5 },
  notes: "Solid.",
  recommendation: "YES" as const,
};

beforeEach(() => {
  findUniqueParticipant.mockReset();
  upsertFeedback.mockReset();
  findUniqueParticipant.mockResolvedValue({ role: "INTERVIEWER" });
  upsertFeedback.mockResolvedValue({ id: "feedback_1" });
});

describe("submitFeedback", () => {
  test("an INTERVIEWER participant of this interview may submit", async () => {
    const result = await submitFeedback(INTERVIEWER_ID, input);

    expect(result).toEqual({ id: "feedback_1" });
    expect(findUniqueParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          interviewId_userId: { interviewId: "interview_1", userId: INTERVIEWER_ID },
        },
      }),
    );
  });

  // Not a participant at all — e.g. a recruiter from the same org poking the
  // directly-invocable Server Action with someone else's interviewId.
  test("a non-participant is rejected", async () => {
    findUniqueParticipant.mockResolvedValue(null);

    await expect(submitFeedback("user_outsider", input)).rejects.toThrow(FeedbackError);
    expect(upsertFeedback).not.toHaveBeenCalled();
  });

  // The one that matters most: the candidate IS a participant of their own
  // interview, so an existence check alone would let them score themselves.
  test("the candidate on this interview cannot submit feedback about themselves", async () => {
    findUniqueParticipant.mockResolvedValue({ role: "CANDIDATE" });

    await expect(submitFeedback("user_candidate", input)).rejects.toThrow(FeedbackError);
    expect(upsertFeedback).not.toHaveBeenCalled();
  });

  test("an OBSERVER participant cannot submit feedback", async () => {
    findUniqueParticipant.mockResolvedValue({ role: "OBSERVER" });

    await expect(submitFeedback("user_observer", input)).rejects.toThrow(FeedbackError);
    expect(upsertFeedback).not.toHaveBeenCalled();
  });

  // Resubmission revises the same row rather than adding a second opinion
  // from one person, which would silently double their weight in review.
  test("resubmitting upserts on (interviewId, interviewerId)", async () => {
    await submitFeedback(INTERVIEWER_ID, input);

    expect(upsertFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          interviewId_interviewerId: {
            interviewId: "interview_1",
            interviewerId: INTERVIEWER_ID,
          },
        },
        create: expect.objectContaining({ interviewerId: INTERVIEWER_ID, recommendation: "YES" }),
        update: expect.objectContaining({ recommendation: "YES" }),
      }),
    );
  });
});

describe("submitFeedbackSchema", () => {
  test("rejects a rubric score outside 1-5", () => {
    for (const bad of [0, 6, 2.5]) {
      const parsed = submitFeedbackSchema.safeParse({
        ...input,
        rubricScores: { ...input.rubricScores, coding: bad },
      });
      expect(parsed.success).toBe(false);
    }
  });

  // The fixed-key rubric is the whole reason scores are comparable across
  // interviewers, so a missing criterion has to fail rather than default.
  test("rejects a partial rubric", () => {
    expect(
      submitFeedbackSchema.safeParse({ ...input, rubricScores: { coding: 4 } }).success,
    ).toBe(false);
  });

  test("notes are optional", () => {
    const { notes, ...withoutNotes } = input;
    void notes;
    expect(submitFeedbackSchema.safeParse(withoutNotes).success).toBe(true);
  });
});
