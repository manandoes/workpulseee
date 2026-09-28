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
import { createCredential, readCredentialForm } from "@/lib/vault-data";
import { createCredentialSchema } from "@/lib/validations/vault";

/**
 * POST /api/vault/credentials — store a credential for a client (Plan: client
 * vault). Multipart: a JSON `payload` (title, text/file kind, key/value
 * fields, remark, clientId) plus a `file` for a file credential. Vault
 * managers only.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageClientVault(actor)) {
    return forbidden("Only owners, admins and managers can add credentials.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Expected a form upload.", 400, "invalid_body");
  }

  try {
    const read = await readCredentialForm(form);
    if (!read.ok) return writeFailure(read);

    const parsed = createCredentialSchema.safeParse(read.payload);
    if (!parsed.success) return validationError(parsed.error);

    const result = await createCredential(actor, parsed.data, read.upload);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json(
      { credential: result.credential },
      { status: 201 }
    );
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/vault/credentials",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
