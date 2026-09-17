-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "emailApiKeyEncrypted" TEXT,
ADD COLUMN     "emailFromAddress" TEXT,
ADD COLUMN     "emailProvider" TEXT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "googleEventId" TEXT;
