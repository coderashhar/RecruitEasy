-- AlterTable
ALTER TABLE "recordings" ADD COLUMN     "error" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "recordings_egressId_key" ON "recordings"("egressId");

