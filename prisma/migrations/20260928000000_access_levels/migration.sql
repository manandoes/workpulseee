-- Plan: access levels. Hand-written rather than `migrate dev`-generated:
--  * Prisma would rebuild "CompanyRole" by casting role::text into a new type
--    that has no 'HR', failing on every existing HR login. RENAME VALUE keeps
--    those rows and turns them into HR Head with their powers intact.
--  * The Phase 21 request-approver columns (still without a migration of
--    their own) are deliberately left out — this holds only the access delta.

-- HR splits into HR Head (the old HR) and the new, narrower HR Team.
ALTER TYPE "CompanyRole" RENAME VALUE 'HR' TO 'HRHead';
ALTER TYPE "CompanyRole" ADD VALUE 'HRTeam';

-- The full catalog of powers the Owner can switch per person. New values are
-- only usable once this migration commits, which is why the grant backfill is
-- the separate `..._access_levels_backfill` migration that follows.
ALTER TYPE "GrantedPermission" ADD VALUE 'ViewAttendance';
ALTER TYPE "GrantedPermission" ADD VALUE 'ManagePayroll';
ALTER TYPE "GrantedPermission" ADD VALUE 'SendBulkEmail';
ALTER TYPE "GrantedPermission" ADD VALUE 'ManageHrPolicies';
ALTER TYPE "GrantedPermission" ADD VALUE 'ViewPerformance';
ALTER TYPE "GrantedPermission" ADD VALUE 'ManagePerformance';
ALTER TYPE "GrantedPermission" ADD VALUE 'ManageClientVault';
ALTER TYPE "GrantedPermission" ADD VALUE 'ViewFinancials';

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('Grant', 'Revoke');

-- CreateEnum
CREATE TYPE "PermissionChangeKind" AS ENUM ('PowerOn', 'PowerOff', 'Reset', 'LevelChanged');

-- PermissionGrant: overrides for company logins as well as employees, and
-- "take away" as well as "give". Existing rows are all employee grants and
-- keep effect 'Grant' through the default.
ALTER TABLE "PermissionGrant" DROP CONSTRAINT "PermissionGrant_grantedById_fkey";

ALTER TABLE "PermissionGrant" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "effect" "PermissionEffect" NOT NULL DEFAULT 'Grant',
ALTER COLUMN "employeeId" DROP NOT NULL,
ALTER COLUMN "grantedById" DROP NOT NULL;

-- Exactly one subject per override (Prisma cannot express a CHECK itself).
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_one_subject_check" CHECK (("employeeId" IS NULL) <> ("accountId" IS NULL));

-- CreateTable
CREATE TABLE "PermissionChange" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "changedById" TEXT,
    "employeeId" TEXT,
    "accountId" TEXT,
    "kind" "PermissionChangeKind" NOT NULL,
    "permission" "GrantedPermission",
    "fromRole" "CompanyRole",
    "toRole" "CompanyRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PermissionChange_one_subject_check" CHECK (("employeeId" IS NULL) <> ("accountId" IS NULL))
);

-- CreateIndex
CREATE INDEX "PermissionChange_companyId_createdAt_idx" ON "PermissionChange"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionChange_employeeId_idx" ON "PermissionChange"("employeeId");

-- CreateIndex
CREATE INDEX "PermissionChange_accountId_idx" ON "PermissionChange"("accountId");

-- CreateIndex
CREATE INDEX "PermissionGrant_accountId_idx" ON "PermissionGrant"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGrant_companyId_accountId_permission_key" ON "PermissionGrant"("companyId", "accountId", "permission");

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (SetNull now: removing the granting login must never delete
-- a 'Revoke' and silently hand the power back)
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionChange" ADD CONSTRAINT "PermissionChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionChange" ADD CONSTRAINT "PermissionChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionChange" ADD CONSTRAINT "PermissionChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionChange" ADD CONSTRAINT "PermissionChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
