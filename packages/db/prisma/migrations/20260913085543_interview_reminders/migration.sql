-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "reminder1hSentAt" TIMESTAMP(3),
ADD COLUMN     "reminder24hSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "interviews_status_scheduledAt_idx" ON "interviews"("status", "scheduledAt");
