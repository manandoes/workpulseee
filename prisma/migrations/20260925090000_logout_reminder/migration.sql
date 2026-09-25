-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
-- is not used in the same transaction; nothing below writes a notification.
ALTER TYPE "NotificationType" ADD VALUE 'LogoutReminder';

-- CreateEnum
CREATE TYPE "AttendanceEndReason" AS ENUM ('Manual', 'AutoNoResponse');

-- AlterTable
-- 1080 = 18:00. Existing rows take the same defaults a new company gets, so
-- the sweep has a working baseline for every tenant without a backfill.
ALTER TABLE "Company" ADD COLUMN     "endOfDayMinutes" INTEGER NOT NULL DEFAULT 1080,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- AlterTable
-- All three are nullable: an already-open session has never been reminded and
-- has confirmed nothing, which is exactly what NULL means to
-- `resolveLogoutNudge`. Sessions already closed keep a NULL reason rather than
-- claiming to have been closed manually.
ALTER TABLE "AttendanceRecord" ADD COLUMN     "clockOutReason" "AttendanceEndReason",
ADD COLUMN     "logoutReminderAt" TIMESTAMP(3),
ADD COLUMN     "presenceConfirmedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AttendanceRecord_clockOutAt_idx" ON "AttendanceRecord"("clockOutAt");
