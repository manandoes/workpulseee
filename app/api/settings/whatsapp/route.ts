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
import { encryptWhatsAppAccessToken } from "@/lib/company-whatsapp-config";
import { canManageWhatsAppSettings } from "@/lib/permissions";
import { whatsappSettingsSchema } from "@/lib/validations/settings";

/**
 * PATCH /api/settings/whatsapp — the company's own Meta WhatsApp Business
 * Cloud API credentials (Settings -> WhatsApp delivery).
 *
 * Owner-only (`canManageWhatsAppSettings`), same shape as
 * `app/api/settings/email/route.ts`. A blank `whatsappAccessToken` means "keep
 * the token already on file" — the form never gets the real token back to
 * prefill, so this is the only way to change phone number ID or template
 * without re-entering it.
 */
export async function PATCH(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageWhatsAppSettings(actor)) {
    return forbidden("Only the owner can change WhatsApp delivery settings.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = whatsappSettingsSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const {
      whatsappPhoneNumberId,
      whatsappAccessToken,
      whatsappTemplateName,
      whatsappTemplateLanguage,
    } = parsed.data;

    const company = await db.company.update({
      where: { id: actor.companyId },
      data: {
        whatsappPhoneNumberId,
        whatsappTemplateName,
        whatsappTemplateLanguage,
        ...(whatsappAccessToken
          ? {
              whatsappAccessTokenEncrypted: encryptWhatsAppAccessToken(
                whatsappAccessToken
              ),
            }
          : {}),
      },
      select: {
        whatsappPhoneNumberId: true,
        whatsappAccessTokenEncrypted: true,
        whatsappTemplateName: true,
        whatsappTemplateLanguage: true,
      },
    });

    return NextResponse.json({
      whatsappPhoneNumberId: company.whatsappPhoneNumberId,
      whatsappAccessTokenSet: company.whatsappAccessTokenEncrypted !== null,
      whatsappTemplateName: company.whatsappTemplateName,
      whatsappTemplateLanguage: company.whatsappTemplateLanguage,
    });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/settings/whatsapp",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}