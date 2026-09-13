import "server-only";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 =
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

const BUCKET = process.env.R2_BUCKET ?? "interviewhub";

export function isStorageConfigured(): boolean {
  return r2 !== null;
}

/** What LiveKit Egress needs to upload straight into the same bucket. */
export function r2UploadTarget() {
  if (!r2) return null;
  return {
    accessKey: process.env.R2_ACCESS_KEY_ID!,
    secret: process.env.R2_SECRET_ACCESS_KEY!,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    bucket: BUCKET,
  };
}

export class StorageError extends Error {}

/**
 * Uploads a file to R2 and returns its key.
 *
 * When R2 is not configured (dev without credentials), stores nothing and
 * returns a placeholder key so the rest of the flow still works.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  if (!r2) {
    console.info("[storage] R2 not configured — skipping upload for key:", key);
    return key;
  }

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  } catch (err) {
    console.error("[storage] Upload failed:", err);
    throw new StorageError("Failed to upload file.");
  }
}

/**
 * Reads a stored file back, or null when R2 isn't configured or the object is
 * missing. Callers authorize first: this has no notion of who may read what.
 */
export async function downloadFile(
  key: string,
): Promise<{ body: Uint8Array } | null> {
  if (!r2) return null;

  try {
    const object = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!object.Body) return null;
    return { body: await object.Body.transformToByteArray() };
  } catch (err) {
    console.error("[storage] Download failed:", err);
    return null;
  }
}

/**
 * A time-limited GET link, for files too large to stream through a server
 * function (a recording is hundreds of megabytes; Vercel caps a response at a
 * few). Authorize before calling: anyone holding the link can use it until
 * it expires, so keep `expiresInSeconds` short.
 */
export async function getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
  if (!r2) return null;
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Deletes a stored file. Returns false (and logs) on failure instead of throwing. */
export async function deleteFile(key: string): Promise<boolean> {
  if (!r2) return false;
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    console.error("[storage] Delete failed:", err);
    return false;
  }
}
