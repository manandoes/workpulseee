-- CreateTable
CREATE TABLE "TaskMatrix" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT,
    "quadrant" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskMatrix_taskId_key" ON "TaskMatrix"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskMatrix_employeeId_taskId_key" ON "TaskMatrix"("employeeId", "taskId");

-- CreateIndex
CREATE INDEX "TaskMatrix_taskId_idx" ON "TaskMatrix"("taskId");

-- AddForeignKey
ALTER TABLE "TaskMatrix" ADD CONSTRAINT "TaskMatrix_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMatrix" ADD CONSTRAINT "TaskMatrix_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
