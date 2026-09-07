import { z } from "zod";

/**
 * Required skills arrive from the job form as one comma-separated string, but
 * the column is `String[]` and every other caller (seed script, tests, a future
 * API) naturally passes a list. Accepting both here means the split lives with
 * the contract rather than being re-implemented at each call site — and the
 * trim/drop-empty step can't be forgotten by one of them, which is how
 * `["React", " TypeScript", ""]` reaches the database.
 */
export const skillsListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(",")).map((skill) => skill.trim()).filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(80)).max(50));

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10_000),
  requiredSkills: skillsListSchema,
});
export type CreateJobInput = z.infer<typeof createJobSchema>;
