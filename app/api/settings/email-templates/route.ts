import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageEmailSettings } from "@/lib/permissions";
import {
  loadEmailTemplates,
  resetEmailTemplate,
  saveEmailTemplate,
} from "@/lib/email-template-data";
import {
  emailTemplateSchema,
  resetEmailTemplateSchema,
} from "@/lib/validations/email-templates";

/**
 * The company's invite email overrides (Plan: editable invite template).
 *
 * Owner-only, same gate as the email-delivery settings this sits beside —
 * these emails go out under the company's own sending identity.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageEmailSettings(actor)) {
    return forbidden("Only the owner can edit email templates.");
  }

  try {
    const templates = await loadEmailTemplates(actor.companyId);
    return NextResponse.json({ templates });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/settings/email-templates",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function PUT(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageEmailSettings(actor)) {
    return forbidden("Only the owner can edit email templates.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = emailTemplateSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const template = await saveEmailTemplate(actor.companyId, parsed.data);
    return NextResponse.json({ template });
  } catch (cause) {
    return serverError(
      {
        route: "PUT /api/settings/email-templates",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** Drop the override and go back to WorkPulse's built-in copy. */
export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageEmailSettings(actor)) {
    return forbidden("Only the owner can edit email templates.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = resetEmailTemplateSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await resetEmailTemplate(actor.companyId, parsed.data.kind);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/settings/email-templates",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
