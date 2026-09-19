/**
 * Uploaded file rules (Plan: file storage foundation).
 *
 * Pure, dependency-free helpers so they stay unit-testable and can be imported
 * from both the upload route and the client-side picker — the same split
 * `lib/chat.ts` uses against `lib/chat-data.ts`.
 *
 * Bytes are stored in Postgres (`StoredFile`), so the size cap here is what
 * keeps the table a document store rather than a media library. It is enforced
 * server-side in `lib/files-data.ts`; the client checks it too, only to fail
 * fast with a better message.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * What a browser is allowed to be handed back from `/api/files/[id]`.
 *
 * An allowlist rather than a denylist, and deliberately free of `text/html`
 * and `image/svg+xml`: both execute script when opened in a tab, which would
 * turn any upload into stored XSS against everyone who can read it
 * (Architecture.md section 8, the same reasoning `Attachment.url` is
 * http/https-only for).
 */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

/** Images are the only types worth rendering inline rather than as a download. */
export function isImageMimeType(value: string): boolean {
  return value.startsWith("image/");
}

/**
 * Strips a client-supplied filename down to something safe to echo back in a
 * `Content-Disposition` header.
 *
 * Removes directory separators (so a name can never be read as a path), and
 * the quotes, newlines and control characters that would otherwise let a
 * crafted name break out of the quoted header value and inject a header of
 * its own.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, "").trim();
  return cleaned.slice(0, 200) || "file";
}

/** Human-readable size for the upload UI. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
