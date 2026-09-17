import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptEmailApiKey } from "@/lib/company-email-config";
import { canManageEmailSettings } from "@/lib/permissions";
import { emailSettingsSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/email — the company's own Resend/Brevo identity for
 * invite and notification emails (Settings -> Email delivery).
 *
 * Owner-only (`canManageEmailSettings`), same shape as
 * `app/api/settings/branding/route.ts`. A blank `emailApiKey` means "keep the
 * key already on file" — the form never gets the real key back to prefill,
 * so this is the only way to change provider/from without re-entering it.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageEmailSettings(actor)) {
    return forbidden("Only the owner can change email delivery settings.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = emailSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { emailProvider, emailFromAddress, emailApiKey } = parsed.data;

    const company = await db.company.update({
      where: { id: actor.companyId },
      data: {
        emailProvider,
        emailFromAddress,
        ...(emailApiKey
          ? { emailApiKeyEncrypted: encryptEmailApiKey(emailApiKey) }
          : {}),
      },
      select: {
        emailProvider: true,
        emailFromAddress: true,
        emailApiKeyEncrypted: true,
      },
    });

    return NextResponse.json({
      emailProvider: company.emailProvider,
      emailFromAddress: company.emailFromAddress,
      emailApiKeySet: company.emailApiKeyEncrypted !== null,
    });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/email",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
