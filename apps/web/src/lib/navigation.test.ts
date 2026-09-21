import { describe, expect, it } from "vitest";
import { activeHref, navigationFor } from "./navigation";

describe("navigationFor", () => {
  it("gives ADMIN the recruiter nav plus administration", () => {
    const recruiter = navigationFor("RECRUITER");
    const admin = navigationFor("ADMIN");
    expect(admin.slice(0, recruiter.length)).toEqual(recruiter);

    const administration = admin.at(-1);
    expect(administration?.items.map((item) => item.href)).toEqual([
      "/admin/audit",
      "/admin/deletion-requests",
    ]);
  });

  it("puts notifications in the candidate's sidebar", () => {
    const hrefs = navigationFor("CANDIDATE").flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs).toContain("/notifications");
  });

  it("offers every role their own calendar settings", () => {
    // Settings belong to the person, not the role — a candidate has the same
    // calendar to connect as a recruiter.
    for (const role of ["CANDIDATE", "INTERVIEWER", "RECRUITER", "ADMIN"] as const) {
      const hrefs = navigationFor(role).flatMap((section) => section.items.map((item) => item.href));
      expect(hrefs).toContain("/settings/calendar");
    }
  });

  it("never shows administration to a recruiter", () => {
    const hrefs = navigationFor("RECRUITER").flatMap((section) => section.items.map((item) => item.href));
    expect(hrefs.some((href) => href.startsWith("/admin"))).toBe(false);
  });

  it("drops zero counts rather than printing them", () => {
    const [section] = navigationFor("INTERVIEWER", { feedbackDue: 0, upcomingInterviews: 3 });
    expect(section.items.find((item) => item.label === "Feedback due")?.count).toBeUndefined();
    expect(section.items.find((item) => item.label === "My interviews")?.count).toBe(3);
  });
});

describe("activeHref", () => {
  const sections = navigationFor("ADMIN");

  it("matches the page itself", () => {
    expect(activeHref(sections, "/recruiter")).toBe("/recruiter");
  });

  it("prefers the most specific parent over the dashboard root", () => {
    expect(activeHref(sections, "/recruiter/interviews/abc")).toBe("/recruiter/interviews");
    expect(activeHref(sections, "/recruiter/candidates/abc")).toBe("/recruiter");
  });

  it("does not treat a shared string prefix as a parent", () => {
    expect(activeHref(navigationFor("CANDIDATE"), "/candidates")).toBeNull();
  });
});
