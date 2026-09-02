import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireCurrentUser } from "@/lib/users";
import { createJob } from "./actions";

// Plain <textarea>, styled to match Input: this form submits uncontrolled via a
// Server Action (FormData), and there is no shadcn textarea primitive in the
// project. Same reasoning as the native <select> on the schedule page.
const textareaClassName =
  "min-h-28 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function NewJobPage() {
  await requireCurrentUser(["RECRUITER", "ADMIN"]);

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Post a job</CardTitle>
          <CardDescription>
            Candidates are added to a job before they can be interviewed.
          </CardDescription>
        </CardHeader>
        <form action={createJob} className="flex flex-col gap-5 px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={200} placeholder="Backend Engineer" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              required
              maxLength={10_000}
              className={textareaClassName}
              placeholder="What this person will own."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requiredSkills">Required skills</Label>
            <Input
              id="requiredSkills"
              name="requiredSkills"
              placeholder="TypeScript, PostgreSQL, Docker"
            />
            <p className="text-xs text-muted-foreground">Comma-separated. Optional.</p>
          </div>

          <Button type="submit">Post job</Button>
        </form>
      </Card>
    </div>
  );
}
