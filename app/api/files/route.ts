import { NextResponse } from "next/server";
import { apiError, serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { storeFile } from "@/lib/files-data";
import { MAX_FILE_BYTES } from "@/lib/files";

/**
 * POST /api/files — upload one file (Plan: file storage foundation).
 *
 * Multipart rather than JSON/base64: base64 inflates bytes by a third over the
 * wire, which the avatar upload can afford at ~500 KB but a 5 MB document
 * cannot. Any signed-in member of a company may upload; what a file is *used
 * for* is authorized by the feature that references it, not here.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Expected a file upload.", 400, "invalid_body");
  }

  const entry = form.get("file");
  if (!(entry instanceof File)) {
    return apiError("Choose a file to upload.", 400, "invalid_body");
  }

  // Checked before reading the stream into memory, so an oversized upload
  // cannot be buffered in full just to be rejected afterwards.
  if (entry.size > MAX_FILE_BYTES) {
    return apiError("That file is larger than 5 MB.", 413, "file_too_large");
  }

  try {
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const result = await storeFile(actor, {
      name: entry.name,
      mimeType: entry.type,
      bytes,
    });

    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ file: result.file }, { status: 201 });
  } catch (cause) {
    return serverError(
      { route: "POST /api/files", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}
