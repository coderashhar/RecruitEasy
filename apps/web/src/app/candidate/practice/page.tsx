import { PageHeader } from "@/components/broadsheet/section";
import { PracticeWorkspace } from "@/components/practice/practice-workspace";
import { PRACTICE_RUN_LIMIT, practiceRunsRemaining } from "@/lib/practice";
import { PRACTICE_PROBLEMS } from "@/lib/practice-problems";
import { requireCurrentUser } from "@/lib/users";

export default async function PracticePage() {
  const { user } = await requireCurrentUser(["CANDIDATE"]);
  const remaining = await practiceRunsRemaining(user.id);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Practice"
        description="The same editor you will use in the real interview · nothing here is shared with employers"
      />
      <PracticeWorkspace
        problems={PRACTICE_PROBLEMS}
        initialRemaining={remaining}
        runLimit={PRACTICE_RUN_LIMIT.limit}
      />
    </div>
  );
}
