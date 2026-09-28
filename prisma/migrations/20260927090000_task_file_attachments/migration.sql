-- An attachment is now a link or an uploaded file.
ALTER TABLE "Attachment" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN "fileId" TEXT;

CREATE UNIQUE INDEX "Attachment_fileId_key" ON "Attachment"("fileId");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
