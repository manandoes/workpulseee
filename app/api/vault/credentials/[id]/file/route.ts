import { apiError, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadCredentialFile } from "@/lib/vault-data";

/**
 * GET /api/vault/credentials/[id]/file — download a file credential's
 * document, decrypted (Plan: client vault). The same access rule as revealing
 * the credential; a missing, non-file or forbidden credential all read as 404.
 *
 * Always a download, never inline, and never cached — unlike `/api/files`,
 * whose uploads are merely tenant-private, this is a secret.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/vault/credentials/[id]/file">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  try {
    const file = await loadCredentialFile(actor, id);
    if (!file) return apiError("That file does not exist.", 404, "not_found");

    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.data.byteLength),
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/vault/credentials/[id]/file",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
