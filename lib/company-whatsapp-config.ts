import { db } from "@/lib/db";
import { openString, sealString } from "@/lib/secret-box";

/**
 * Per-company Meta WhatsApp Business Cloud API credentials (Settings ->
 * WhatsApp delivery, Owner-only) — the WhatsApp counterpart of
 * `lib/company-email-config.ts`, and built the same way. The access token must
 * stay reversible, since Meta needs the actual token on every send, so it is
 * AES-256-GCM encrypted at rest under its own env var
 * (`WHATSAPP_CONFIG_ENCRYPTION_KEY`) so it rotates independently of the email
 * key.
 *
 * `loadWhatsAppConfig` returns `null` when the phone number ID or token is
 * missing — "not configured for this company" — so `lib/whatsapp.ts` falls
 * back to the global `WHATSAPP_*` env vars.
 */

const KEY_ENV = "WHATSAPP_CONFIG_ENCRYPTION_KEY";

/** What `lib/whatsapp.ts` sends with; template fields already defaulted. */
export type CompanyWhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
};

export const DEFAULT_WHATSAPP_TEMPLATE_NAME = "workpulse_notification";
export const DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE = "en";

export function encryptWhatsAppAccessToken(plaintext: string): string {
  return sealString(plaintext, KEY_ENV);
}

export function decryptWhatsAppAccessToken(stored: string): string {
  return openString(stored, KEY_ENV);
}

/**
 * This company's own WhatsApp config, or `null` if it hasn't set one up — the
 * caller should fall back to the global env vars in that case.
 */
export async function loadWhatsAppConfig(
  companyId: string
): Promise<CompanyWhatsAppConfig | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      whatsappPhoneNumberId: true,
      whatsappAccessTokenEncrypted: true,
      whatsappTemplateName: true,
      whatsappTemplateLanguage: true,
    },
  });

  if (!company?.whatsappPhoneNumberId || !company.whatsappAccessTokenEncrypted) {
    return null;
  }

  return {
    phoneNumberId: company.whatsappPhoneNumberId,
    accessToken: decryptWhatsAppAccessToken(
      company.whatsappAccessTokenEncrypted
    ),
    templateName:
      company.whatsappTemplateName ?? DEFAULT_WHATSAPP_TEMPLATE_NAME,
    templateLanguage:
      company.whatsappTemplateLanguage ?? DEFAULT_WHATSAPP_TEMPLATE_LANGUAGE,
  };
}
