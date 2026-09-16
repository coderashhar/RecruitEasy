/**
 * Decides whether a thrown message is fit to show someone.
 *
 * Server Actions throw sentences written for the person reading them
 * ("That candidate has already applied to this job."). Everything else —
 * a Prisma query dump, a stack, a connection string, a stringified object —
 * is noise that makes a small problem look like a broken system. When in
 * doubt this returns null and the page falls back to its own plain line.
 *
 * Pure, so the rule is tested without rendering an error.
 */
const MAX_LENGTH = 160;

const TECHNICAL = [
  /prisma|postgres|sql|ECONNREFUSED|ETIMEDOUT|fetch failed/i,
  /\b(at\s+\w+\s*\(|\.ts:\d+|\.js:\d+)/, // stack frames
  /https?:\/\/|@[\w.-]+:\d+/, // URLs, hosts with ports
  /[`{}<>]|\r|\n/, // code fences, JSON, markup, multi-line dumps
  /^[A-Za-z]*Error\b|^\[/, // "TypeError: …", "[module] …"
  /invalid `|undefined|null|NaN|\bstack\b/i,
];

export function friendlyErrorMessage(message: string | undefined | null): string | null {
  const text = message?.trim();
  if (!text || text.length > MAX_LENGTH) return null;

  // Next replaces the real message with this in production.
  if (/^An error occurred in the Server Components render/i.test(text)) return null;

  if (TECHNICAL.some((pattern) => pattern.test(text))) return null;

  // An authored sentence starts like one and ends like one.
  if (!/^[A-Z“"']/.test(text)) return null;
  if (!/[.!?]$/.test(text)) return null;

  return text;
}
