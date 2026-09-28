import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadVaultBrowser } from "@/lib/vault-data";

/**
 * GET /api/vault — the top-bar key menu's content (Plan: client vault): every
 * client holding credentials, each credential's title, and where the caller
 * stands with it. Titles only — nothing secret is in this response.
 *
 * Open to every signed-in actor: a vault manager gets `access: "manage"` on
 * everything plus the pending-request count; everyone else gets their own
 * access status per credential.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    return NextResponse.json(await loadVaultBrowser(actor));
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/vault",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
