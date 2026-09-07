import { describe, test, expect } from "vitest";
import { rescheduleInterviewSchema, scheduleInterviewSchema } from "@interviewhub/types";

describe("submittedDateSchema (via the interview schemas)", () => {
  // The regression this guards: z.coerce.date() alone runs `new Date(input)`,
  // and `new Date(null)` is 1970-01-01 rather than an error. FormData.get()
  // returns null for a missing key, so a directly-invoked Server Action that
  // omitted scheduledAt used to validate cleanly and rewrite the interview to
  // the epoch.
  for (const bad of [null, undefined, "", "   not a date   "]) {
    test(`rejects ${JSON.stringify(bad)} rather than coercing it`, () => {
      const parsed = rescheduleInterviewSchema.safeParse({
        interviewId: "interview_1",
        scheduledAt: bad,
        durationMins: 60,
      });
      expect(parsed.success).toBe(false);
    });
  }

  test("accepts the ISO string the form actually submits", () => {
    const parsed = rescheduleInterviewSchema.safeParse({
      interviewId: "interview_1",
      scheduledAt: "2026-10-01T14:30:00.000Z",
      durationMins: 60,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.scheduledAt.toISOString()).toBe(
      "2026-10-01T14:30:00.000Z",
    );
  });

  test("accepts a real Date, so non-form callers don't have to stringify", () => {
    const parsed = scheduleInterviewSchema.safeParse({
      applicationId: "app_1",
      scheduledAt: new Date("2026-10-01T14:30:00.000Z"),
      durationMins: 60,
      interviewerIds: ["user_1"],
    });
    expect(parsed.success).toBe(true);
  });
});
