import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "./error-copy";

describe("friendlyErrorMessage", () => {
  it("keeps the sentences the app itself throws", () => {
    for (const message of [
      "That candidate has already applied to this job.",
      "One or more interviewers are already booked at that time.",
      "Cannot move an interview from COMPLETED to CANCELLED.",
      "This interview was changed by someone else — reload and try again.",
    ]) {
      expect(friendlyErrorMessage(message)).toBe(message);
    }
  });

  it("hides database and network internals", () => {
    expect(
      friendlyErrorMessage(
        "Invalid `prisma.user.findUnique()` invocation: Can't reach database server at ep-x.us-east-2.aws.neon.tech:5432",
      ),
    ).toBeNull();
    expect(friendlyErrorMessage("TypeError: fetch failed")).toBeNull();
    expect(friendlyErrorMessage("connect ECONNREFUSED 127.0.0.1:4000")).toBeNull();
  });

  it("hides stacks, dumps and module tags", () => {
    expect(friendlyErrorMessage("at handler (/app/src/lib/jobs.ts:31:9)")).toBeNull();
    expect(friendlyErrorMessage('{"code":"P2002"}')).toBeNull();
    expect(friendlyErrorMessage("[execution] Judge0 call failed.")).toBeNull();
  });

  it("hides production's placeholder and anything overlong or empty", () => {
    expect(friendlyErrorMessage("An error occurred in the Server Components render.")).toBeNull();
    expect(friendlyErrorMessage(`${"Something went wrong ".repeat(12)}.`)).toBeNull();
    expect(friendlyErrorMessage("   ")).toBeNull();
    expect(friendlyErrorMessage(undefined)).toBeNull();
  });

  it("hides fragments that don't read as a sentence", () => {
    expect(friendlyErrorMessage("failed")).toBeNull();
    expect(friendlyErrorMessage("Something broke")).toBeNull();
  });
});
