import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

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

const IV_BYTES = 12;

export type EmailProvider = "resend" | "brevo";

export type CompanyEmailConfig = {
  provider: EmailProvider;
  apiKey: string;
  from: string;
};

function encryptionKey(): Buffer {
  const raw = process.env.EMAIL_CONFIG_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("EMAIL_CONFIG_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "EMAIL_CONFIG_ENCRYPTION_KEY must decode to 32 bytes (generate with: openssl rand -base64 32)"
    );
  }
  return key;
}

/** AES-256-GCM encrypt, storing `iv.authTag.ciphertext` base64url-joined. */
export function encryptEmailApiKey(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64url"))
    .join(".");
}

export function decryptEmailApiKey(stored: string): string {
  const [ivPart, authTagPart, ciphertextPart] = stored.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted email API key");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
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
