import { db } from "@/lib/db";
import { openString, sealString } from "@/lib/secret-box";

/**
 * Per-company transactional email identity (Settings -> Email delivery,
 * Owner-only). A company's own Resend or Brevo API key must stay reversible —
 * the provider's API needs the actual key on every send — so it is encrypted
 * at rest with AES-256-GCM, the same scheme
 * `lib/google-calendar-crypto.ts` uses for Google refresh tokens, but under
 * its own env var (`EMAIL_CONFIG_ENCRYPTION_KEY`) so the two secrets rotate
 * independently.
 *
 * `loadEmailConfig` returns `null` when any of the three fields is missing —
 * "not configured for this company" — so callers fall back to the global
 * `EMAIL_FROM` plus `BREVO_API_KEY`/`RESEND_API_KEY` env vars, the same
 * graceful-degradation rule `lib/mailer.ts` already follows on its own.
 */

const KEY_ENV = "EMAIL_CONFIG_ENCRYPTION_KEY";

export type EmailProvider = "resend" | "brevo";

export type CompanyEmailConfig = {
  provider: EmailProvider;
  apiKey: string;
  from: string;
};

/** AES-256-GCM encrypt (`lib/secret-box.ts`) under the email config key. */
export function encryptEmailApiKey(plaintext: string): string {
  return sealString(plaintext, KEY_ENV);
}

export function decryptEmailApiKey(stored: string): string {
  return openString(stored, KEY_ENV);
}

function isEmailProvider(value: string): value is EmailProvider {
  return value === "resend" || value === "brevo";
}

/**
 * This company's own email config, or `null` if it hasn't set one up (any of
 * the three fields missing) — the caller should fall back to the global env
 * vars in that case.
 */
export async function loadEmailConfig(
  companyId: string
): Promise<CompanyEmailConfig | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      emailProvider: true,
      emailFromAddress: true,
      emailApiKeyEncrypted: true,
    },
  });

  if (
    !company?.emailProvider ||
    !company.emailFromAddress ||
    !company.emailApiKeyEncrypted ||
    !isEmailProvider(company.emailProvider)
  ) {
    return null;
  }

  return {
    provider: company.emailProvider,
    from: company.emailFromAddress,
    apiKey: decryptEmailApiKey(company.emailApiKeyEncrypted),
  };
}
