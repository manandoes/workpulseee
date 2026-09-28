-- Phase 21: a request is addressed to one approver (a company account or a
-- grant-holding employee). Null on requests made before this, which keep the
-- role-based rule in canDecideOnRequest.
-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "requestedApproverAccountId" TEXT,
ADD COLUMN     "requestedApproverEmployeeId" TEXT;

-- CreateIndex
CREATE INDEX "Request_requestedApproverAccountId_idx" ON "Request"("requestedApproverAccountId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_requestedApproverAccountId_fkey" FOREIGN KEY ("requestedApproverAccountId") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_requestedApproverEmployeeId_fkey" FOREIGN KEY ("requestedApproverEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

