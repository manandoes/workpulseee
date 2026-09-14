-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TaskAssigned', 'TaskCompleted', 'DeadlineApproaching', 'RequestSubmitted', 'RequestDecided');

-- AlterTable: CompanyAccount gains a phone number for WhatsApp delivery.
ALTER TABLE "CompanyAccount" ADD COLUMN "phone" TEXT;

-- AlterTable: Notification gains a type and a sweep dedupe key.
--
-- `type` is NOT NULL, so existing rows need a value. The two events that could
-- have written a row before this migration are distinguishable by their link:
-- a decision points the employee at their own copy under /my-space, everything
-- else was the submission notice sent to approvers. The column default is only
-- scaffolding for that backfill and is dropped immediately, so every future
-- write must state the type explicitly.
ALTER TABLE "Notification" ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'RequestSubmitted';
UPDATE "Notification" SET "type" = 'RequestDecided' WHERE "link" LIKE '/my-space/requests/%';
ALTER TABLE "Notification" ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "accountId" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "accountId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Postgres treats every NULL as distinct, so this constrains only the sweep's
-- keyed rows and leaves event-driven notifications (dedupeKey NULL) unaffected.
CREATE UNIQUE INDEX "Notification_companyId_dedupeKey_key" ON "Notification"("companyId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_employeeId_key" ON "NotificationPreference"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_accountId_key" ON "NotificationPreference"("accountId");

-- CreateIndex
CREATE INDEX "NotificationPreference_companyId_idx" ON "NotificationPreference"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_companyId_idx" ON "PushSubscription"("companyId");

-- CreateIndex
CREATE INDEX "PushSubscription_employeeId_idx" ON "PushSubscription"("employeeId");

-- CreateIndex
CREATE INDEX "PushSubscription_accountId_idx" ON "PushSubscription"("accountId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
