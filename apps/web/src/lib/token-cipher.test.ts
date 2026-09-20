import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  decryptToken,
  encryptToken,
  isTokenCipherConfigured,
  readKey,
  secretsMatch,
  TokenCipherError,
} from "./token-cipher";

const KEY = randomBytes(32);

describe("readKey", () => {
  test("accepts 64 hex characters", () => {
    expect(readKey(KEY.toString("hex"))?.equals(KEY)).toBe(true);
  });

  test("accepts base64", () => {
    expect(readKey(KEY.toString("base64"))?.equals(KEY)).toBe(true);
  });

  test("tolerates surrounding whitespace, which a copied .env line carries", () => {
    expect(readKey(`  ${KEY.toString("hex")}\n`)?.equals(KEY)).toBe(true);
  });

  test("rejects a key that is the wrong length rather than padding it", () => {
    expect(readKey(randomBytes(16).toString("hex"))).toBeNull();
  });

  test("is null when unset, which is what gates the whole feature", () => {
    expect(readKey(undefined)).toBeNull();
    expect(readKey("")).toBeNull();
  });
});

describe("isTokenCipherConfigured", () => {
  test("reads the environment, and this suite sets no key", () => {
    // Guards the default: an unconfigured deployment must not offer the flow.
    expect(isTokenCipherConfigured()).toBe(process.env.CALENDAR_TOKEN_KEY !== undefined);
  });
});

describe("encryptToken / decryptToken", () => {
  test("round-trips a refresh token", () => {
    const token = "1//0gRefreshTokenValue-abcdefg_hijklmnop";
    expect(decryptToken(encryptToken(token, KEY), KEY)).toBe(token);
  });

  test("round-trips non-ASCII", () => {
    const token = "réfresh–token–ünicode";
    expect(decryptToken(encryptToken(token, KEY), KEY)).toBe(token);
  });

  test("gives a different ciphertext each time, so equal tokens aren't linkable", () => {
    expect(encryptToken("same", KEY)).not.toBe(encryptToken("same", KEY));
  });

  test("a ciphertext written under one key can't be read under another", () => {
    const encoded = encryptToken("secret", KEY);
    expect(() => decryptToken(encoded, randomBytes(32))).toThrow(TokenCipherError);
  });

  test("a tampered ciphertext fails rather than decrypting to something else", () => {
    // The whole reason for GCM over CBC: without the tag, flipping bits here
    // would yield a different plaintext instead of an error.
    const [prefix, iv, tag, ciphertext] = encryptToken("secret", KEY).split(".");
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[0] ^= 0xff;
    const tampered = [prefix, iv, tag, bytes.toString("base64url")].join(".");
    expect(() => decryptToken(tampered, KEY)).toThrow(TokenCipherError);
  });

  test("a tampered auth tag fails too", () => {
    const [prefix, iv, tag, ciphertext] = encryptToken("secret", KEY).split(".");
    const bytes = Buffer.from(tag, "base64url");
    bytes[0] ^= 0xff;
    expect(() =>
      decryptToken([prefix, iv, bytes.toString("base64url"), ciphertext].join("."), KEY),
    ).toThrow(TokenCipherError);
  });

  test("rejects anything that isn't the v1 format", () => {
    expect(() => decryptToken("plaintext-token", KEY)).toThrow(TokenCipherError);
    expect(() => decryptToken("v2.a.b.c", KEY)).toThrow(TokenCipherError);
    expect(() => decryptToken("v1.a.b", KEY)).toThrow(TokenCipherError);
  });

  test("rejects an IV of the wrong length instead of letting the cipher decide", () => {
    const [prefix, , tag, ciphertext] = encryptToken("secret", KEY).split(".");
    const shortIv = randomBytes(8).toString("base64url");
    expect(() => decryptToken([prefix, shortIv, tag, ciphertext].join("."), KEY)).toThrow(
      TokenCipherError,
    );
  });

  test("throws a named error when no key is configured", () => {
    const previous = process.env.CALENDAR_TOKEN_KEY;
    delete process.env.CALENDAR_TOKEN_KEY;
    try {
      // Without the explicit key argument it falls back to the environment,
      // which is the path every real caller takes.
      expect(() => encryptToken("secret")).toThrow(TokenCipherError);
    } finally {
      if (previous !== undefined) process.env.CALENDAR_TOKEN_KEY = previous;
    }
  });
});

describe("secretsMatch", () => {
  test("true only for identical strings", () => {
    expect(secretsMatch("nonce-abc", "nonce-abc")).toBe(true);
    expect(secretsMatch("nonce-abc", "nonce-abd")).toBe(false);
  });

  test("false for different lengths, without throwing", () => {
    expect(secretsMatch("short", "much longer value")).toBe(false);
  });
});
