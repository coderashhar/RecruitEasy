import { describe, expect, test } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth.js";

describe("isAuthorizedCronRequest", () => {
  test("accepts exactly the bearer secret", () => {
    expect(isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true);
  });

  test("rejects a wrong, partial or missing header", () => {
    expect(isAuthorizedCronRequest("Bearer wrong!", "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest(null, "s3cret")).toBe(false);
  });

  // An unset secret must lock the route, not open it: "Bearer " + undefined
  // must never be something a caller can simply send.
  test("with no secret configured, nothing is authorized", () => {
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });
});
