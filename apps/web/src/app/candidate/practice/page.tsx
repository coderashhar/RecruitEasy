import { PracticeWorkspace } from "@/components/practice/practice-workspace";
import { PRACTICE_RUN_LIMIT, practiceRunsRemaining } from "@/lib/practice";
import { PRACTICE_PROBLEMS } from "@/lib/practice-problems";
import { requireCurrentUser } from "@/lib/users";

export default async function PracticePage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const remaining = await practiceRunsRemaining(user.id);

  return (
    <PracticeWorkspace
      problems={PRACTICE_PROBLEMS}
      initialRemaining={remaining}
      runLimit={PRACTICE_RUN_LIMIT.limit}
    />
  );
}
