import "server-only";

import { prisma } from "@interviewhub/db";
import { deleteFile } from "./storage";

const DAY = 24 * 60 * 60 * 1000;

/**
 * RECORDING_RETENTION_DAYS as a whole number of days, or null when unset or
 * invalid. Null means recordings are kept: deleting interview recordings is
 * irreversible, so it only happens when someone has chosen a period.
 */
export function recordingRetentionDays(raw: string | undefined = process.env.RECORDING_RETENTION_DAYS): number | null {
  if (!raw) return null;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : null;
}

/**
 * Practice-run counters only matter inside their one-hour window; a day is
 * ample margin. Polish counters are lifetime caps and are never swept —
 * deleting them would hand candidates their attempts back.
 */
const PRACTICE_HIT_TTL_MS = DAY;

export interface RetentionResult {
  recordingsExpired: number;
  recordingsFailedToDelete: number;
  rateLimitHitsDeleted: number;
}

/**
 * One retention sweep. Safe to repeat or overlap: deleting an already-deleted
 * file succeeds, and the row update is conditional on the file key still
 * being there. A file R2 won't delete leaves its row untouched, so the next
 * sweep tries again rather than claiming it's gone.
 */
export async function runRetention(now: Date = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = { recordingsExpired: 0, recordingsFailedToDelete: 0, rateLimitHitsDeleted: 0 };

  const days = recordingRetentionDays();
  if (days !== null) {
    const due = await prisma.recording.findMany({
      where: {
        status: { in: ["READY", "FAILED"] },
        fileKey: { not: null },
        updatedAt: { lt: new Date(now.getTime() - days * DAY) },
      },
      select: { id: true, fileKey: true },
      take: 100,
    });

    for (const recording of due) {
      if (!(await deleteFile(recording.fileKey!))) {
        result.recordingsFailedToDelete += 1;
        continue;
      }
      const { count } = await prisma.recording.updateMany({
        where: { id: recording.id, fileKey: recording.fileKey },
        data: {
          status: "EXPIRED",
          fileKey: null,
          error: `Deleted after ${days} days under the recording retention policy.`,
        },
      });
      result.recordingsExpired += count;
    }
  }

  const { count } = await prisma.rateLimitHit.deleteMany({
    where: { key: { startsWith: "practice:" }, createdAt: { lt: new Date(now.getTime() - PRACTICE_HIT_TTL_MS) } },
  });
  result.rateLimitHitsDeleted = count;

  return result;
}
