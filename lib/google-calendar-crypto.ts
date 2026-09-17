import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Secrets for the Google Calendar integration (Plan.md Phase 17).
 *
 * A Google refresh token must stay reversible — Google requires the actual
 * token back on every API call, so unlike an invite token
 * (`lib/invites.ts`'s one-way SHA-256) it cannot be hashed. It is encrypted
 * at rest with AES-256-GCM under `GOOGLE_TOKEN_ENCRYPTION_KEY` and never
 * returned to any client.
 *
 * The same key also signs the OAuth `state` round-trip parameter (HMAC-SHA256,
 * constant-time compared with `timingSafeEqual` — the same primitive
 * `lib/invites.ts`'s `tokenHashMatches` already uses). No cookie is involved:
 * Google already round-trips `state` for us, so the signed value travels as
 * the query param itself rather than needing a new cookie mechanism this repo
 * has no other precedent for.
 */

const IV_BYTES = 12;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function encryptionKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (generate with: openssl rand -base64 32)"
    );
  }
  return key;
}

/** Whether every env var the Google Calendar integration needs is set. */
export function googleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  );
}

/** AES-256-GCM encrypt, storing `iv.authTag.ciphertext` base64url-joined. */
export function encryptRefreshToken(plaintext: string): string {
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

export function decryptRefreshToken(stored: string): string {
  const [ivPart, authTagPart, ciphertextPart] = stored.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted refresh token");
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

export type OAuthStatePayload = {
  actorId: string;
  companyId: string;
  accountType: "employee" | "company";
  issuedAt: number;
};

function hmac(data: string): string {
  return createHmac("sha256", encryptionKey())
    .update(data)
    .digest("base64url");
}

/** Sign a CSRF `state` parameter to round-trip through Google's OAuth flow. */
export function signOAuthState(
  payload: Omit<OAuthStatePayload, "issuedAt">
): string {
  const body: OAuthStatePayload = { ...payload, issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url"
  );
  return `${encoded}.${hmac(encoded)}`;
}

/**
 * Verify a `state` parameter: signature intact, not expired, still naming the
 * actor who started the flow. Returns `null` on any failure rather than
 * throwing — a broken OAuth round-trip must not break the callback page.
 */
export function verifyOAuthState(
  token: string,
  expected: { actorId: string; companyId: string },
  now: Date = new Date()
): OAuthStatePayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = hmac(encoded);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (now.getTime() - payload.issuedAt > OAUTH_STATE_TTL_MS) return null;
  if (payload.actorId !== expected.actorId) return null;
  if (payload.companyId !== expected.companyId) return null;

  return payload;
}
