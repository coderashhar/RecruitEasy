import "server-only";

import { prisma } from "@interviewhub/db";

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly limit: number,
  ) {
    super(message);
  }
}

export interface ConsumeRateLimitInput {
  /** Namespaced by caller, e.g. `polish:<applicationId>` or `practice:<userId>`. */
  key: string;
  limit: number;
  /** Rolling window. Omit for a lifetime cap on the key. */
  windowMs?: number;
}

// Time spent queued behind the advisory lock counts against Prisma's
// interactive-transaction timeout, which defaults to 5s. Each transaction is
// three round trips to a remote Postgres, so a burst on one key (a user
// hammering Run) queued past that default and failed with P2028 in testing
// against Neon — an error, rather than a clean "limit reached".
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * Records one use of `key`, or throws RateLimitError if `limit` uses already
 * exist inside the window.
 *
 * Count-then-insert is only a limit if nothing can interleave between the two,
 * so both run in one transaction holding a Postgres advisory lock on the key.
 * Without the lock, N simultaneous requests all read the same count, all pass,
 * and all insert — a double-click, or a script, walks straight past the cap.
 * The lock is transaction-scoped, so it releases on commit or rollback and
 * holds up only callers of the same key, never the rest of the table.
 *
 * Returns the hit's id so a caller whose downstream work fails (an LLM error,
 * say) can hand the attempt back with releaseRateLimit.
 */
export async function consumeRateLimit({
  key,
  limit,
  windowMs,
}: ConsumeRateLimitInput): Promise<{ hitId: string; remaining: number }> {
  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`, which
    // Prisma cannot deserialize as a result column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    const used = await tx.rateLimitHit.count({
      where: {
        key,
        ...(windowMs !== undefined && { createdAt: { gte: new Date(Date.now() - windowMs) } }),
      },
    });

    if (used >= limit) {
      throw new RateLimitError(`Limit of ${limit} reached for ${key}.`, limit);
    }

    const hit = await tx.rateLimitHit.create({ data: { key }, select: { id: true } });
    return { hitId: hit.id, remaining: limit - used - 1 };
  }, TRANSACTION_OPTIONS);
}

/** Gives back an attempt whose work never happened. Safe to call twice. */
export async function releaseRateLimit(hitId: string): Promise<void> {
  await prisma.rateLimitHit.deleteMany({ where: { id: hitId } });
}
