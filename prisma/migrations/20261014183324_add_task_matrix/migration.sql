-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ChatMessage';

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "googleChatConnectedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskMatrix" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskMatrix_companyId_idx" ON "TaskMatrix"("companyId");

-- CreateIndex
CREATE INDEX "TaskMatrix_actorId_idx" ON "TaskMatrix"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMatrix_actorId_taskId_key" ON "TaskMatrix"("actorId", "taskId");

-- AddForeignKey
ALTER TABLE "TaskMatrix" ADD CONSTRAINT "TaskMatrix_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMatrix" ADD CONSTRAINT "TaskMatrix_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMatrix" ADD CONSTRAINT "TaskMatrix_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
