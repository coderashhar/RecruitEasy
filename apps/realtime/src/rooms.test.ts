import { describe, test, expect, vi, beforeEach } from "vitest";

let hydrationCount = 0;

vi.mock("@interviewhub/db", () => ({
  prisma: {
    codeDocument: {
      async findUnique() {
        hydrationCount += 1;
        // A real await boundary — this is the window the join path races in.
        await new Promise((r) => setTimeout(r, 25));
        return null;
      },
      async upsert() {
        return {};
      },
    },
  },
  Prisma: {},
}));

const { getRoom, onJoin, onLeave } = await import("./rooms.js");

describe("room lifecycle", () => {
  beforeEach(() => {
    hydrationCount = 0;
  });

  test("concurrent joins share one Y.Doc and hydrate once", async () => {
    // Interviewer and candidate opening the room in the same tick is the
    // normal case, not an edge case.
    const [a, b] = await Promise.all([getRoom("interview-1"), getRoom("interview-1")]);

    expect(hydrationCount).toBe(1);
    expect(a).toBe(b);

    onJoin("interview-1", a);
    onJoin("interview-1", b);
    expect(a.connections).toBe(2);

    // An edit by one participant must be visible to the other.
    a.doc.getText("code").insert(0, "hello");
    expect(b.doc.getText("code").toString()).toBe("hello");
  });

  test("a rejoin during the final save is not evicted", async () => {
    const room = await getRoom("interview-2");
    onJoin("interview-2", room);

    onLeave("interview-2", room); // last participant leaves -> async final save
    const rejoin = await getRoom("interview-2"); // someone rejoins mid-flight
    onJoin("interview-2", rejoin);
    expect(rejoin).toBe(room);

    await new Promise((r) => setTimeout(r, 80)); // let the final save settle
    expect(await getRoom("interview-2")).toBe(room);
  });

  test("a failed hydration is not cached", async () => {
    const failing = await import("@interviewhub/db");
    const spy = vi
      .spyOn(failing.prisma.codeDocument, "findUnique")
      .mockRejectedValueOnce(new Error("db down"));

    await expect(getRoom("interview-3")).rejects.toThrow("db down");

    // The next join must retry rather than inherit the rejected promise.
    spy.mockRestore();
    const room = await getRoom("interview-3");
    expect(room.doc).toBeDefined();
  });
});
