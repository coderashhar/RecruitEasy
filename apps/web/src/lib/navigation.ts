import type { Role } from "./roles";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
  /** Danger for work that is overdue or waiting on someone's rights; warning for debt. */
  countTone?: "muted" | "warning" | "danger";
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface NavCounts {
  activeApplications?: number;
  upcomingInterviews?: number;
  feedbackDue?: number;
  pendingDeletions?: number;
  applications?: number;
}

/** Zero reads as nothing to see, so it is left off rather than printed. */
function count(value: number | undefined) {
  return value ? value : undefined;
}

/**
 * The sidebar for each role. Same shell, different first screen: a recruiter
 * lands on the pipeline, an interviewer on their day, a candidate on where
 * each application stands. ADMIN sees everything a recruiter does, plus the
 * administration section.
 */
export function navigationFor(role: Role, counts: NavCounts = {}): NavSection[] {
  switch (role) {
    case "CANDIDATE":
      return [
        {
          items: [
            { href: "/candidate", label: "Overview" },
            { href: "/candidate/applications", label: "Applications", count: count(counts.applications) },
            { href: "/candidate/interviews", label: "Interviews", count: count(counts.upcomingInterviews) },
            { href: "/notifications", label: "Notifications" },
            { href: "/candidate/practice", label: "Practice" },
            { href: "/jobs", label: "Browse jobs" },
          ],
        },
        {
          label: "Privacy",
          items: [
            { href: "/candidate/data", label: "Your data" },
            { href: "/settings/calendar", label: "Calendar" },
          ],
        },
      ];
    case "INTERVIEWER":
      return [
        {
          items: [
            { href: "/recruiter", label: "Today" },
            { href: "/recruiter/interviews", label: "My interviews", count: count(counts.upcomingInterviews) },
            {
              href: "/recruiter/feedback",
              label: "Feedback due",
              count: count(counts.feedbackDue),
              countTone: "warning",
            },
            { href: "/recruiter/candidates", label: "Candidates" },
          ],
        },
        { label: "You", items: [{ href: "/settings/calendar", label: "Calendar" }] },
      ];
    case "RECRUITER":
    case "ADMIN": {
      const hiring: NavSection = {
        label: "Hiring",
        items: [
          { href: "/recruiter", label: "Pipeline", count: count(counts.activeApplications) },
          { href: "/recruiter/interviews", label: "Interviews", count: count(counts.upcomingInterviews) },
          { href: "/recruiter/schedule", label: "Schedule" },
          { href: "/recruiter/jobs", label: "Jobs" },
          { href: "/recruiter/analytics", label: "Analytics" },
        ],
      };
      const you: NavSection = {
        label: "You",
        items: [{ href: "/settings/calendar", label: "Calendar" }],
      };
      if (role === "RECRUITER") return [hiring, you];
      return [
        hiring,
        you,
        {
          label: "Administration",
          items: [
            { href: "/admin/audit", label: "Audit log" },
            {
              href: "/admin/deletion-requests",
              label: "Deletion requests",
              count: count(counts.pendingDeletions),
              countTone: "danger",
            },
          ],
        },
      ];
    }
  }
}

/**
 * The nav item a pathname belongs to: the most specific href that is the path
 * itself or a parent of it. "/recruiter" would otherwise claim every page under
 * it, including the ones with their own item.
 */
export function activeHref(sections: NavSection[], pathname: string): string | null {
  let best: string | null = null;
  for (const { items } of sections) {
    for (const { href } of items) {
      const matches = pathname === href || pathname.startsWith(`${href}/`);
      if (matches && (best === null || href.length > best.length)) best = href;
    }
  }
  return best;
}

export const ROLE_LABEL: Record<Role, string> = {
  CANDIDATE: "Candidate",
  INTERVIEWER: "Interviewer",
  RECRUITER: "Recruiter",
  ADMIN: "Admin",
};
