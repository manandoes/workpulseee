-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BreakRecord" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PerformanceRecord" ADD COLUMN     "accountId" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AttendanceRecord_accountId_clockInAt_idx" ON "AttendanceRecord"("accountId", "clockInAt");

-- CreateIndex
CREATE INDEX "BreakRecord_accountId_startedAt_idx" ON "BreakRecord"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "Feedback_accountId_idx" ON "Feedback"("accountId");

-- CreateIndex
CREATE INDEX "Goal_accountId_idx" ON "Goal"("accountId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_accountId_computedAt_idx" ON "PerformanceRecord"("accountId", "computedAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
