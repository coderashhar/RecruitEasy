// Authenticated symmetric encryption for the OAuth tokens in
// `calendar_accounts`. Pure crypto, no I/O and no "server-only" import, so it
// is unit-testable in isolation — the same reasoning as lib/ics.ts.
//
// Why at all: everything else this database holds is data *about* people. A
// Google refresh token is a live bearer credential *for* a person's calendar,
// valid until revoked. A dump of the table — a backup, a read replica, a
// support export — would otherwise hand over every connected calendar. PRD
// FR-8.2 asks for encryption at rest; a managed Postgres encrypts the disk,
// which protects against a stolen disk and nothing else.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than decrypting to something attacker-chosen. 96-bit IV is the size GCM is
 * specified for; a 128-bit tag is the maximum.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Marks the format so a future key rotation or algorithm change is detectable. */
const PREFIX = "v1";

export class TokenCipherError extends Error {}

/**
 * The 32-byte key from CALENDAR_TOKEN_KEY, as 64 hex characters or 44
 * characters of base64 — `openssl rand -hex 32` and `openssl rand -base64 32`
 * both work, so nobody has to remember which one this wanted.
 *
 * Read per call rather than at module load: the settings page and the sync job
 * both import this transitively, and a module-level throw would take down
 * pages that never touch a calendar.
 */
export function readKey(raw: string | undefined = process.env.CALENDAR_TOKEN_KEY): Buffer | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  return key.length === KEY_BYTES ? key : null;
}

/** Whether a usable key is configured — the gate the whole feature hangs off. */
export function isTokenCipherConfigured(): boolean {
  return readKey() !== null;
}

function requireKey(): Buffer {
  const key = readKey();
  if (!key) {
    throw new TokenCipherError(
      "CALENDAR_TOKEN_KEY is missing or not a 32-byte key — cannot handle calendar tokens.",
    );
  }
  return key;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. One column, no schema for it. */
export function encryptToken(plaintext: string, key: Buffer = requireKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(encoded: string, key: Buffer = requireKey()): string {
  const [prefix, iv, tag, ciphertext] = encoded.split(".");
  if (prefix !== PREFIX || !iv || !tag || !ciphertext) {
    throw new TokenCipherError("Stored calendar token is not in the expected format.");
  }

  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new TokenCipherError("Stored calendar token is not in the expected format.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or the row was tampered with. Deliberately one message for
    // both: which one it is isn't something a caller can act on differently.
    throw new TokenCipherError("Stored calendar token could not be read with the configured key.");
  }
}

/**
 * Constant-time string comparison for the OAuth `state` nonce. `===` on
 * secrets leaks their prefix through timing; this is the same guard
 * lib/cron-auth.ts puts on CRON_SECRET.
 */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
