-- DropIndex
-- Redundant once the unique index below exists: a btree on (jobId, candidateId)
-- already serves lookups filtered by jobId alone via its leftmost prefix.
DROP INDEX "applications_jobId_idx";

-- CreateIndex
-- One application per candidate per job.
--
-- This will fail on any database that already holds a duplicate pair, and that
-- is deliberate: the rows are real applications, possibly with interviews and
-- resumes hanging off them, so a migration must not pick one to delete on its
-- own. If deploy fails here, reconcile the duplicates by hand first. (Verified
-- zero duplicates on this project's database before the constraint was added.)
CREATE UNIQUE INDEX "applications_jobId_candidateId_key" ON "applications"("jobId", "candidateId");
