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
import { canManageClientVault } from "@/lib/permissions";
import { decideCredentialAccess } from "@/lib/vault-data";
import { decideAccessSchema } from "@/lib/validations/vault";

/**
 * PATCH /api/vault/access/[id] — approve or reject a pending request, or
 * revoke approved access (Plan: client vault). Vault managers only; the
 * requester is notified either way.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/vault/access/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageClientVault(actor)) {
    return forbidden(
      "Only owners, admins and managers can decide vault access."
    );
  }

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = decideAccessSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await decideCredentialAccess(actor, id, parsed.data.action);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ status: result.status });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/vault/access/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
