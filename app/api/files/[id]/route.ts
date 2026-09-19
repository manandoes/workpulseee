import { apiError, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadFileForDownload } from "@/lib/files-data";
import { isImageMimeType } from "@/lib/files";

/**
 * GET /api/files/[id] — download one uploaded file.
 *
 * `loadFileForDownload` filters by the actor's `companyId`, so a file id
 * guessed or leaked from another tenant reads as "not found" rather than
 * serving bytes. That scoping is the whole security boundary here — the id
 * itself is never treated as an authorization token.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/files/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  try {
    const file = await loadFileForDownload(actor, id);
    if (!file) return apiError("That file does not exist.", 404, "not_found");

    // Images render inline (chat previews); everything else is forced to
    // download rather than opened in a tab, so a document can never be
    // interpreted as a page in this origin.
    const disposition = isImageMimeType(file.mimeType)
      ? "inline"
      : "attachment";

    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.data.byteLength),
        "Content-Disposition": `${disposition}; filename="${file.name}"`,
        // Uploaded files are immutable, but they are also tenant-private, so
        // only the requesting browser may hold on to them.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/files/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
