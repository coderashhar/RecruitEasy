-- DropIndex
-- Redundant once the unique index below exists: a btree on (jobId, candidateId)
-- already serves lookups filtered by jobId alone via its leftmost prefix.
DROP INDEX "applications_jobId_idx";

-- CreateIndex
-- One application per candidate per job.
CREATE UNIQUE INDEX "applications_jobId_candidateId_key" ON "applications"("jobId", "candidateId");
