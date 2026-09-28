-- Plan: completion note. Optional text asked for when a task is moved to
-- Done; nullable, so existing rows need no backfill.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "completionNote" TEXT;
