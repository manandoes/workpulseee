import { db } from "@/lib/db";
import { openString, sealString } from "@/lib/secret-box";

/**
 * Per-company Google Chat OAuth credentials.
 *
 * Mirrors `lib/company-whatsapp-config.ts` in structure: the refresh token
 * must stay reversible (Google requires it on every API call), so it is
 * AES-256-GCM encrypted at rest under `GOOGLE_TOKEN_ENCRYPTION_KEY`, the same
 * key the calendar integration already uses. The refresh token is stored on
 * `Company.googleChatRefreshTokenEncrypted`.
 *
 * `loadGoogleChatConfig` returns `null` when the company has not connected
 * Google Chat yet — callers should fall back to `Native` chat.
 */

const KEY_ENV = "GOOGLE_TOKEN_ENCRYPTION_KEY";

export type CompanyGoogleChatConfig = {
  refreshToken: string;
  connectedByEmail: string;
  connectedAt: Date;
};

export function encryptRefreshToken(plaintext: string): string {
  return sealString(plaintext, KEY_ENV);
}

export function decryptRefreshToken(stored: string): string {
  return openString(stored, KEY_ENV);
}

/**
 * Returns the company's Google Chat config, or null when not connected.
 * Also checks that the company has opted into Google Chat via
 * `messagingProvider !== "Native"`.
 */
export async function loadGoogleChatConfig(
  companyId: string
): Promise<CompanyGoogleChatConfig | null> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      googleChatRefreshTokenEncrypted: true,
      googleChatConnectedByEmail: true,
      googleChatConnectedAt: true,
      messagingProvider: true,
      googleChatEnabled: true,
    },
  });

  if (!company?.googleChatRefreshTokenEncrypted) {
    return null;
  }

  if (
    company.messagingProvider === "Native" ||
    !company.googleChatEnabled
  ) {
    return null;
  }

  return {
    refreshToken: decryptRefreshToken(
      company.googleChatRefreshTokenEncrypted
    ),
    connectedByEmail: company.googleChatConnectedByEmail ?? "",
    connectedAt: company.googleChatConnectedAt ?? new Date(),
  };
}

/** Whether every env var needed for Google Chat OAuth is present. */
export function googleChatConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  );
}
