import { describe, test, expect } from "vitest";
import { ROLES, SELF_ASSIGNABLE_ROLES, DASHBOARD_PATH, isRole, isSelfAssignableRole } from "./roles";

describe("isRole", () => {
  test("accepts every known role", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
  });

  test("rejects unknown values", () => {
    for (const value of ["admin", "Candidate", "", "SUPERUSER", null, undefined, 0, {}]) {
      expect(isRole(value)).toBe(false);
    }
  });
});

describe("isSelfAssignableRole", () => {
  test("accepts the three onboarding roles", () => {
    for (const role of SELF_ASSIGNABLE_ROLES) expect(isSelfAssignableRole(role)).toBe(true);
  });

  // The whole point of the guard: ADMIN is a real role, so isRole() lets it
  // through, but it must never be self-assignable via the onboarding action.
  test("rejects ADMIN even though it is a valid role", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isSelfAssignableRole("ADMIN")).toBe(false);
  });

  test("rejects unknown values", () => {
    for (const value of ["admin", "", null, undefined, 0, {}]) {
      expect(isSelfAssignableRole(value)).toBe(false);
    }
  });
});

describe("DASHBOARD_PATH", () => {
  test("every role has a landing route", () => {
    for (const role of ROLES) expect(DASHBOARD_PATH[role]).toMatch(/^\//);
  });

  test("only candidates land on the candidate dashboard", () => {
    expect(DASHBOARD_PATH.CANDIDATE).toBe("/candidate");
    for (const role of ["INTERVIEWER", "RECRUITER", "ADMIN"] as const) {
      expect(DASHBOARD_PATH[role]).toBe("/recruiter");
    }
  });
});
