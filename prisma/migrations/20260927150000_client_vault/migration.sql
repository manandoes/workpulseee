-- CreateEnum
CREATE TYPE "CredentialAccessStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Revoked');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VaultAccessRequested';
ALTER TYPE "NotificationType" ADD VALUE 'VaultAccessDecided';

-- CreateTable
CREATE TABLE "ClientCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileEncrypted" BYTEA,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCredentialAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT,
    "requesterAccountId" TEXT,
    "status" "CredentialAccessStatus" NOT NULL DEFAULT 'Pending',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ClientCredentialAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientCredential_companyId_idx" ON "ClientCredential"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCredential_clientId_title_key" ON "ClientCredential"("clientId", "title");

-- CreateIndex
CREATE INDEX "ClientCredentialAccess_companyId_status_idx" ON "ClientCredentialAccess"("companyId", "status");

-- CreateIndex
CREATE INDEX "ClientCredentialAccess_requesterEmployeeId_idx" ON "ClientCredentialAccess"("requesterEmployeeId");

-- CreateIndex
CREATE INDEX "ClientCredentialAccess_requesterAccountId_idx" ON "ClientCredentialAccess"("requesterAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCredentialAccess_credentialId_requesterEmployeeId_key" ON "ClientCredentialAccess"("credentialId", "requesterEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCredentialAccess_credentialId_requesterAccountId_key" ON "ClientCredentialAccess"("credentialId", "requesterAccountId");

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredentialAccess" ADD CONSTRAINT "ClientCredentialAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredentialAccess" ADD CONSTRAINT "ClientCredentialAccess_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ClientCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredentialAccess" ADD CONSTRAINT "ClientCredentialAccess_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredentialAccess" ADD CONSTRAINT "ClientCredentialAccess_requesterAccountId_fkey" FOREIGN KEY ("requesterAccountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCredentialAccess" ADD CONSTRAINT "ClientCredentialAccess_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

