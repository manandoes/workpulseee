import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Reversible encryption for secrets the app must be able to read back
 * (AES-256-GCM) — a Google refresh token, a company's email API key, a
 * client's social media password.
 *
 * Every caller passes the name of its *own* env var, so each kind of secret
 * sits under a separate key and can be rotated without touching the others.
 * GCM's auth tag means a tampered value fails to open rather than decrypting
 * to garbage.
 */

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** The 32-byte key held (base64) in `envVar`, or a throw naming the problem. */
export function encryptionKeyFrom(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(`${envVar} is not set`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `${envVar} must decode to 32 bytes (generate with: openssl rand -base64 32)`
    );
  }
  return key;
}

function encrypt(plaintext: Uint8Array, envVar: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeyFrom(envVar), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, authTag: cipher.getAuthTag(), ciphertext };
}

function decrypt(
  parts: { iv: Buffer; authTag: Buffer; ciphertext: Buffer },
  envVar: string
): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKeyFrom(envVar),
    parts.iv
  );
  decipher.setAuthTag(parts.authTag);
  return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
}

/** Encrypt text, stored as `iv.authTag.ciphertext`, each part base64url. */
export function sealString(plaintext: string, envVar: string): string {
  const { iv, authTag, ciphertext } = encrypt(
    Buffer.from(plaintext, "utf8"),
    envVar
  );
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64url"))
    .join(".");
}

export function openString(stored: string, envVar: string): string {
  const [iv, authTag, ciphertext] = stored.split(".");
  if (!iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted value");
  }
  return decrypt(
    {
      iv: Buffer.from(iv, "base64url"),
      authTag: Buffer.from(authTag, "base64url"),
      ciphertext: Buffer.from(ciphertext, "base64url"),
    },
    envVar
  ).toString("utf8");
}

/**
 * Encrypt raw bytes (an uploaded document), stored as one binary blob
 * `iv || authTag || ciphertext` — a `Bytes` column, so no base64 inflation.
 */
export function sealBytes(bytes: Uint8Array, envVar: string): Uint8Array {
  const { iv, authTag, ciphertext } = encrypt(bytes, envVar);
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function openBytes(sealed: Uint8Array, envVar: string): Uint8Array {
  const buf = Buffer.from(sealed);
  if (buf.byteLength < IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("Malformed encrypted value");
  }
  return decrypt(
    {
      iv: buf.subarray(0, IV_BYTES),
      authTag: buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES),
      ciphertext: buf.subarray(IV_BYTES + AUTH_TAG_BYTES),
    },
    envVar
  );
}
