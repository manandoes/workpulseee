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
import {
  deleteCredential,
  readCredentialForm,
  revealCredential,
  updateCredential,
} from "@/lib/vault-data";
import { credentialFormSchema } from "@/lib/validations/vault";

/**
 * GET /api/vault/credentials/[id] — reveal one credential's decrypted fields
 * and remark (Plan: client vault). A vault manager, or someone holding
 * approved access to it; everyone else gets a 403.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/vault/credentials/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  try {
    const result = await revealCredential(actor, id);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json(
      { credential: result.credential },
      // A decrypted secret must never sit in a shared or browser cache.
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/vault/credentials/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * PATCH /api/vault/credentials/[id] — edit a credential, same multipart shape
 * as creating one. A file credential submitted without a new file keeps the
 * one it has. Vault managers only.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/vault/credentials/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageClientVault(actor)) {
    return forbidden("Only owners, admins and managers can edit credentials.");
  }

  const { id } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Expected a form upload.", 400, "invalid_body");
  }

  try {
    const read = await readCredentialForm(form);
    if (!read.ok) return writeFailure(read);

    const parsed = credentialFormSchema.safeParse(read.payload);
    if (!parsed.success) return validationError(parsed.error);

    const result = await updateCredential(actor, id, parsed.data, read.upload);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ credential: result.credential });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/vault/credentials/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * DELETE /api/vault/credentials/[id] — destroy a credential and everyone's
 * access to it. Vault managers only.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/vault/credentials/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageClientVault(actor)) {
    return forbidden(
      "Only owners, admins and managers can delete credentials."
    );
  }

  const { id } = await context.params;

  try {
    const deleted = await deleteCredential(actor, id);
    if (!deleted) {
      return apiError("That credential does not exist.", 404, "not_found");
    }
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/vault/credentials/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
