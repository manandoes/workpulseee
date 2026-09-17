import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestCompany } from "@/lib/test-helpers";
import {
  decryptEmailApiKey,
  encryptEmailApiKey,
  loadEmailConfig,
} from "@/lib/company-email-config";

describe("company-email-config", () => {
  beforeAll(() => {
    // A fixed 32-byte key so these tests don't depend on `.env.local`.
    process.env.EMAIL_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString(
      "base64"
    );
  });

  describe("encryptEmailApiKey / decryptEmailApiKey", () => {
    it("round-trips a key", () => {
      const key = "re_ExampleApiKey123";
      const encrypted = encryptEmailApiKey(key);
      expect(encrypted).not.toContain(key);
      expect(decryptEmailApiKey(encrypted)).toBe(key);
    });

    it("produces a different ciphertext each time (random IV)", () => {
      const key = "re_ExampleApiKey123";
      expect(encryptEmailApiKey(key)).not.toBe(encryptEmailApiKey(key));
    });
  });

  describe("loadEmailConfig", () => {
    it("returns null when the company hasn't configured anything", async () => {
      const { companyId } = await createTestCompany();
      expect(await loadEmailConfig(companyId)).toBeNull();
    });

    it("returns null when only some fields are set", async () => {
      const { companyId } = await createTestCompany();
      await db.company.update({
        where: { id: companyId },
        data: { emailProvider: "resend", emailFromAddress: "a@example.com" },
      });
      expect(await loadEmailConfig(companyId)).toBeNull();
    });

    it("returns the decrypted config once every field is set", async () => {
      const { companyId } = await createTestCompany();
      await db.company.update({
        where: { id: companyId },
        data: {
          emailProvider: "brevo",
          emailFromAddress: "Acme <noreply@acme.com>",
          emailApiKeyEncrypted: encryptEmailApiKey("brevo-secret-key"),
        },
      });

      const config = await loadEmailConfig(companyId);
      expect(config).toEqual({
        provider: "brevo",
        from: "Acme <noreply@acme.com>",
        apiKey: "brevo-secret-key",
      });
    });
  });
});
