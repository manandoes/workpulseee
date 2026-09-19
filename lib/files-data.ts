import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import {
  MAX_FILE_BYTES,
  isAllowedMimeType,
  sanitizeFileName,
} from "@/lib/files";
import { invalidReference, type WriteFailure } from "@/lib/api";

/**
 * Database access for uploaded files (Plan: file storage foundation).
 *
 * Every read below is filtered by the actor's own `companyId`, never by id
 * alone — a `StoredFile` id is the only thing standing between a download URL
 * and another tenant's payslip, so it is deliberately not trusted on its own
 * (Rules.md section 2).
 */

export type StoredFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

/** Who uploaded it, in the same "exactly one of a pair" shape `Attachment` uses. */
function uploaderColumns(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { uploadedByEmployeeId: actor.id }
    : { uploadedById: actor.id };
}

export type StoreFileResult =
  | { ok: true; file: StoredFileSummary }
  | WriteFailure;

export async function storeFile(
  actor: SessionActor,
  input: { name: string; mimeType: string; bytes: Uint8Array }
): Promise<StoreFileResult> {
  return storeFileForCompany(actor.companyId, input, uploaderColumns(actor));
}

/**
 * The same store, for a file whose uploader is not a user of the app.
 *
 * Both uploader columns stay null — a job applicant (Plan: hiring) has no
 * account and never will. Every other rule is unchanged and deliberately so:
 * the type allowlist and the size cap are what keep an *unauthenticated*
 * upload from becoming stored XSS or a disk-filling exercise, so the public
 * path must go through exactly the checks the private one does, not a relaxed
 * copy of them.
 */
export async function storeAnonymousFile(
  companyId: string,
  input: { name: string; mimeType: string; bytes: Uint8Array }
): Promise<StoreFileResult> {
  return storeFileForCompany(companyId, input, {});
}

async function storeFileForCompany(
  companyId: string,
  input: { name: string; mimeType: string; bytes: Uint8Array },
  uploader: { uploadedById?: string; uploadedByEmployeeId?: string }
): Promise<StoreFileResult> {
  if (!isAllowedMimeType(input.mimeType)) {
    return invalidReference("file", "That file type is not supported.");
  }

  if (input.bytes.byteLength === 0) {
    return invalidReference("file", "That file is empty.");
  }

  if (input.bytes.byteLength > MAX_FILE_BYTES) {
    return invalidReference("file", "That file is larger than 5 MB.");
  }

  const file = await db.storedFile.create({
    data: {
      companyId,
      name: sanitizeFileName(input.name),
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      data: Buffer.from(input.bytes),
      ...uploader,
    },
    select: { id: true, name: true, mimeType: true, sizeBytes: true },
  });

  return { ok: true, file };
}

/**
 * The bytes of one file, or null when it does not exist *in the actor's
 * company* — the two cases are deliberately indistinguishable to the caller,
 * so a 404 never confirms that an id belongs to someone else.
 */
export async function loadFileForDownload(
  actor: SessionActor,
  fileId: string
): Promise<{
  name: string;
  mimeType: string;
  data: Uint8Array;
} | null> {
  const file = await db.storedFile.findFirst({
    where: { id: fileId, companyId: actor.companyId },
    select: { name: true, mimeType: true, data: true },
  });

  return file;
}

/** Metadata for several files at once, for rendering attachment chips. */
export async function loadFileSummaries(
  companyId: string,
  fileIds: string[]
): Promise<StoredFileSummary[]> {
  if (fileIds.length === 0) return [];

  return db.storedFile.findMany({
    where: { id: { in: fileIds }, companyId },
    select: { id: true, name: true, mimeType: true, sizeBytes: true },
  });
}

/**
 * Bytes plus name for attaching to an outgoing email, where the provider wants
 * base64 rather than a URL.
 */
export async function loadFilesForEmail(
  companyId: string,
  fileIds: string[]
): Promise<{ name: string; content: string }[]> {
  if (fileIds.length === 0) return [];

  const files = await db.storedFile.findMany({
    where: { id: { in: fileIds }, companyId },
    select: { name: true, data: true },
  });

  return files.map((file) => ({
    name: file.name,
    content: Buffer.from(file.data).toString("base64"),
  }));
}

/** Tenant-scoped delete, used when the record pointing at a file goes away. */
export async function deleteFiles(companyId: string, fileIds: string[]) {
  if (fileIds.length === 0) return;

  await db.storedFile.deleteMany({
    where: { id: { in: fileIds }, companyId },
  });
}
