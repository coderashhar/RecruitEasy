import { redirect } from "next/navigation";

/** Moved to /notifications, which every role can reach. Kept so old bookmarks still land. */
export default function CandidateNotificationsRedirect() {
  redirect("/notifications");
}
