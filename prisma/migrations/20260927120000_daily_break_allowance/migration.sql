-- AlterTable
-- Existing companies take the same one-hour default a new company gets, so
-- every break overlay has an allowance to count down from without a backfill.
ALTER TABLE "Company" ADD COLUMN     "dailyBreakMinutes" INTEGER NOT NULL DEFAULT 60;
