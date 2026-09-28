import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canRequestVaultAccess } from "@/lib/permissions";
import { requestCredentialAccess } from "@/lib/vault-data";
import { requestAccessSchema } from "@/lib/validations/vault";

/**
 * POST /api/vault/access — ask for one or more of a single client's
 * credentials (Plan: client vault). Anyone who is not a vault manager; the
 * managers are notified and decide at `/vault`.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canRequestVaultAccess(actor)) {
    return forbidden("Vault managers can already see every credential.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = requestAccessSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await requestCredentialAccess(actor, parsed.data);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json(
      { requested: result.requested, alreadyOpen: result.alreadyOpen },
      { status: 201 }
    );
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/vault/access",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
