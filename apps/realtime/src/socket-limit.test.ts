import { describe, expect, test } from "vitest";
import { createSocketLimit } from "./socket-limit.js";

describe("createSocketLimit", () => {
  test("allows up to the limit inside one window, then refuses", () => {
    const clock = 1_000;
    const allow = createSocketLimit(3, 10_000, () => clock);

    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
  });

  test("a new window starts the count over", () => {
    let clock = 1_000;
    const allow = createSocketLimit(2, 10_000, () => clock);

    allow();
    allow();
    expect(allow()).toBe(false);

    clock += 10_000;
    expect(allow()).toBe(true);
  });
});
