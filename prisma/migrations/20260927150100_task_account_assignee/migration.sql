-- Plan: allot tasks to a Manager or HR. A task's assignee can now be a
-- company account instead of an employee; nullable, so every existing task
-- keeps its employee assignee (or none) untouched.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assigneeAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Task_assigneeAccountId_idx" ON "Task"("assigneeAccountId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeAccountId_fkey" FOREIGN KEY ("assigneeAccountId") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
