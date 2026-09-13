import "server-only";

import { prisma, type Prisma } from "@interviewhub/db";

export const AUDIT_PAGE_SIZE = 50;

export interface AuditQuery {
  action?: string;
  actorId?: string;
  /** Id of the last row on the previous page. */
  after?: string;
}

/**
 * One page of the org's audit log, newest first. Keyset pagination on
 * (createdAt, id) rather than an offset: the log only ever grows, and an
 * offset would shift under a reader as new entries arrive.
 */
export async function getAuditLogPage(orgId: string, query: AuditQuery) {
  const where: Prisma.AuditLogWhereInput = {
    orgId,
    ...(query.action && { action: query.action }),
    ...(query.actorId && { actorId: query.actorId }),
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    // The cursor row must itself be in this org, or `cursor` would happily
    // start a page from another org's row id and reveal where it sits.
    ...(query.after && (await isInOrg(orgId, query.after)) && { cursor: { id: query.after }, skip: 1 }),
    include: { actor: { select: { name: true, email: true } } },
  });

  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
  return { entries: page, nextAfter: hasMore ? page[page.length - 1].id : null };
}

async function isInOrg(orgId: string, auditLogId: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({ where: { id: auditLogId, orgId }, select: { id: true } });
  return row !== null;
}

/** The actions and actors that appear in this org's log, for the filter menus. */
export async function getAuditFilterOptions(orgId: string) {
  const [actions, actors] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["action"], where: { orgId }, orderBy: { action: "asc" } }),
    prisma.user.findMany({
      where: { orgId, auditLogs: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { actions: actions.map((row) => row.action), actors };
}

/**
 * Where an entry's target can be opened, when the action names a kind of
 * record with a page. Unknown actions get no link rather than a guess.
 */
export function auditTargetHref(action: string, target: string | null): string | null {
  if (!target) return null;
  const [subject] = action.split(".");
  switch (subject) {
    case "interview":
    case "recording":
      return `/recruiter/interviews/${target}`;
    case "application":
      return `/recruiter/candidates/${target}`;
    default:
      return null;
  }
}
