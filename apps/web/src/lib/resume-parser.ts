import "server-only";

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export class ResumeParseError extends Error {}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/**
 * Validates a resume file and extracts its plain text.
 *
 * Returns the parsed text and the detected file extension. Throws
 * ResumeParseError for invalid files — these are user errors, not bugs,
 * so the caller catches them and shows the message.
 */
export async function parseResume(
  file: File,
): Promise<{ text: string; extension: string; buffer: Buffer }> {
  if (!ACCEPTED_TYPES[file.type]) {
    throw new ResumeParseError("Only PDF and DOCX files are accepted.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new ResumeParseError("File must be under 5 MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const extension = ACCEPTED_TYPES[file.type]!;
  let text: string;

  if (extension === "pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = result.text;
    await parser.destroy();
  } else {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  }

  text = text.trim();
  if (!text) {
    throw new ResumeParseError("Could not extract text from the file. Is it scanned or image-only?");
  }

  return { text, extension, buffer };
}
