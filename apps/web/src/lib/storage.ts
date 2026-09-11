import "server-only";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
