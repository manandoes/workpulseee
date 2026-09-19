-- CreateEnum
CREATE TYPE "HiringFormStatus" AS ENUM ('Draft', 'Live', 'Closed');

-- CreateEnum
CREATE TYPE "HiringFormDestination" AS ENUM ('Hosted', 'GoogleForm');

-- CreateEnum
CREATE TYPE "HiringQuestionType" AS ENUM ('ShortText', 'LongText', 'SingleChoice', 'MultiChoice', 'Dropdown', 'Email', 'Phone', 'Number', 'Date', 'Document');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('New', 'Shortlisted', 'Interview', 'Offer', 'Hired', 'Rejected');

-- AlterEnum
ALTER TYPE "GrantedPermission" ADD VALUE 'ManageRecruitment';

-- CreateTable
CREATE TABLE "HiringForm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "team" TEXT,
    "location" TEXT,
    "employmentType" "EmploymentType",
    "status" "HiringFormStatus" NOT NULL DEFAULT 'Draft',
    "destination" "HiringFormDestination" NOT NULL DEFAULT 'Hosted',
    "googleFormId" TEXT,
    "googleResponderUrl" TEXT,
    "googleEditUrl" TEXT,
    "googleIdentityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "googleSyncedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HiringForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiringQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "HiringQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "googleItemId" TEXT,

    CONSTRAINT "HiringQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'New',
    "source" "HiringFormDestination" NOT NULL DEFAULT 'Hosted',
    "googleResponseId" TEXT,
    "submitterIpHash" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT,
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fileId" TEXT,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorEmployeeId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleFormsConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleFormsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiringForm_companyId_status_idx" ON "HiringForm"("companyId", "status");

-- CreateIndex
CREATE INDEX "HiringForm_deletedAt_idx" ON "HiringForm"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HiringForm_companyId_slug_key" ON "HiringForm"("companyId", "slug");

-- CreateIndex
CREATE INDEX "HiringQuestion_formId_order_idx" ON "HiringQuestion"("formId", "order");

-- CreateIndex
CREATE INDEX "HiringQuestion_companyId_idx" ON "HiringQuestion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_googleResponseId_key" ON "JobApplication"("googleResponseId");

-- CreateIndex
CREATE INDEX "JobApplication_companyId_formId_stage_idx" ON "JobApplication"("companyId", "formId", "stage");

-- CreateIndex
CREATE INDEX "JobApplication_formId_submittedAt_idx" ON "JobApplication"("formId", "submittedAt");

-- CreateIndex
CREATE INDEX "JobApplication_companyId_submitterIpHash_submittedAt_idx" ON "JobApplication"("companyId", "submitterIpHash", "submittedAt");

-- CreateIndex
CREATE INDEX "ApplicationAnswer_companyId_idx" ON "ApplicationAnswer"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAnswer_applicationId_questionId_key" ON "ApplicationAnswer"("applicationId", "questionId");

-- CreateIndex
CREATE INDEX "ApplicationNote_applicationId_createdAt_idx" ON "ApplicationNote"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationNote_companyId_idx" ON "ApplicationNote"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleFormsConnection_companyId_key" ON "GoogleFormsConnection"("companyId");

-- AddForeignKey
ALTER TABLE "HiringForm" ADD CONSTRAINT "HiringForm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringForm" ADD CONSTRAINT "HiringForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringQuestion" ADD CONSTRAINT "HiringQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiringQuestion" ADD CONSTRAINT "HiringQuestion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "HiringForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_formId_fkey" FOREIGN KEY ("formId") REFERENCES "HiringForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "HiringQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_authorEmployeeId_fkey" FOREIGN KEY ("authorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleFormsConnection" ADD CONSTRAINT "GoogleFormsConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleFormsConnection" ADD CONSTRAINT "GoogleFormsConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "CompanyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
