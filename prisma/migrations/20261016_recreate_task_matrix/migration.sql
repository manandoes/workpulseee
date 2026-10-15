-- Fix TaskMatrix to match Prisma schema
-- Drop any existing incorrectly-defined TaskMatrix tables
DROP TABLE IF EXISTS "TaskMatrix" CASCADE;

-- Recreate TaskMatrix with the correct schema as defined in Prisma schema
CREATE TABLE "TaskMatrix" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recipientEmployeeId" TEXT,
    "recipientAccountId" TEXT,
    "taskId" TEXT NOT NULL,
    "quadrant" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskMatrix_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "TaskMatrix_companyId_idx" ON "TaskMatrix"("companyId");
CREATE INDEX "TaskMatrix_recipientEmployeeId_idx" ON "TaskMatrix"("recipientEmployeeId");
CREATE INDEX "TaskMatrix_recipientAccountId_idx" ON "TaskMatrix"("recipientAccountId");

-- Unique constraints
CREATE UNIQUE INDEX "TaskMatrix_recipientEmployeeId_taskId_key" ON "TaskMatrix"("recipientEmployeeId", "taskId");
CREATE UNIQUE INDEX "TaskMatrix_recipientAccountId_taskId_key" ON "TaskMatrix"("recipientAccountId", "taskId");

-- Foreign keys
ALTER TABLE "TaskMatrix" 
  ADD CONSTRAINT "TaskMatrix_companyId_fkey" 
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMatrix" 
  ADD CONSTRAINT "TaskMatrix_recipientEmployeeId_fkey" 
  FOREIGN KEY ("recipientEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMatrix" 
  ADD CONSTRAINT "TaskMatrix_recipientAccountId_fkey" 
  FOREIGN KEY ("recipientAccountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMatrix" 
  ADD CONSTRAINT "TaskMatrix_taskId_fkey" 
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
