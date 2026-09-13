import { getLatestResumeKey } from "@/lib/candidate-profile";
import { downloadFile } from "@/lib/storage";
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
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await params;
  const { user } = await requireCurrentUser(["RECRUITER", "INTERVIEWER", "ADMIN"]);

  const key = await getLatestResumeKey(user.orgId, applicationId);
  if (!key) return new Response("No resume on file for this application.", { status: 404 });

  const file = await downloadFile(key);
  if (!file) {
    return new Response("The resume file isn't available — file storage may not be configured.", {
      status: 404,
    });
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
