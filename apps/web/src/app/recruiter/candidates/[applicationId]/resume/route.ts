import { redirect } from "next/navigation";
import { getLatestResumeKey } from "@/lib/candidate-profile";
import type { ResumeIssue } from "@/lib/resume-availability";
import { downloadFile, isStorageConfigured } from "@/lib/storage";
import { requireCurrentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Streams the application's latest resume to a signed-in member of the same
 * org. Served through the app, rather than a presigned R2 link, so every
 * download is authorized at the moment it happens and no link can be
 * forwarded to someone outside the org.
 *
 * When there is nothing to stream, it sends the recruiter back to the profile
 * they clicked from with a reason, instead of stranding them on a bare line of
 * text in an empty tab. The recruiter sees two outcomes — no file was ever
 * uploaded, or the file can't be opened — while *why* it can't be opened
 * (missing object versus unconfigured storage) goes to the server log, where
 * the person who can act on it will look.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await params;
  const { user } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  // Explicitly typed as `never` so TypeScript narrows after each call, the
  // same way it does for a bare `redirect()`.
  const back: (issue: ResumeIssue) => never = (issue) =>
    redirect(`/recruiter/candidates/${applicationId}?resume=${issue}`);

  const key = await getLatestResumeKey(user.orgId, applicationId);
  if (!key) back("none");

  const file = await downloadFile(key);
  if (!file) {
    console.warn(
      isStorageConfigured()
        ? `[resume] object missing from storage for application ${applicationId} (key ${key})`
        : `[resume] file storage is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY), so ${key} was never stored`,
    );
    back("unavailable");
  }

  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension];

  return new Response(Buffer.from(file.body), {
    headers: {
      // Never the stored Content-Type: that came from the candidate's browser
      // at upload, so a file tagged text/html would run as a page on this
      // origin, in a recruiter's signed-in session. Only the two types the
      // upload accepts are served as themselves; anything else is a download.
      "Content-Type": contentType ?? "application/octet-stream",
      "Content-Disposition": `${extension === "pdf" ? "inline" : "attachment"}; filename="resume.${contentType ? extension : "bin"}"`,
      // Even a real PDF can carry script; the browser's viewer gets no access
      // to the app's origin.
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
