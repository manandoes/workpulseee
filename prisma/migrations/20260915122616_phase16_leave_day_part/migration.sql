-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FullDay', 'FirstHalf', 'SecondHalf');

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "dayPart" "LeaveDayPart";
