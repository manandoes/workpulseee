import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTestCompany } from "@/lib/test-helpers";
import {
  decryptWhatsAppAccessToken,
  encryptWhatsAppAccessToken,
  loadWhatsAppConfig,
} from "@/lib/company-whatsapp-config";

describe("company-whatsapp-config", () => {
  beforeAll(() => {
    // A fixed 32-byte key so these tests don't depend on `.env`.
    process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    );
  });

  describe("encryptWhatsAppAccessToken / decryptWhatsAppAccessToken", () => {
    it("round-trips a token", () => {
      const token = "EAAa1b2c3d4e5f6g7h8i9j0";
      const encrypted = encryptWhatsAppAccessToken(token);
      expect(encrypted).not.toContain(token);
      expect(decryptWhatsAppAccessToken(encrypted)).toBe(token);
    });

    it("produces a different ciphertext each time (random IV)", () => {
      const token = "EAAa1b2c3d4e5f6g7h8i9j0";
      expect(encryptWhatsAppAccessToken(token)).not.toBe(
        encryptWhatsAppAccessToken(token)
      );
    });
  });

  describe("loadWhatsAppConfig", () => {
    it("returns null when the company hasn't configured anything", async () => {
      const { companyId } = await createTestCompany();
      expect(await loadWhatsAppConfig(companyId)).toBeNull();
    });

    it("returns null when only some fields are set", async () => {
      const { companyId } = await createTestCompany();
      await db.company.update({
        where: { id: companyId },
        data: {
          whatsappPhoneNumberId: "123456789012345",
          whatsappTemplateName: "workpulse_notification",
        },
      });
      expect(await loadWhatsAppConfig(companyId)).toBeNull();
    });

    it("returns the decrypted config once every field is set", async () => {
      const { companyId } = await createTestCompany();
      await db.company.update({
        where: { id: companyId },
        data: {
          whatsappPhoneNumberId: "123456789012345",
          whatsappAccessTokenEncrypted: encryptWhatsAppAccessToken(
            "EAAa1b2c3d4e5f6g7h8i9j0"
          ),
          whatsappTemplateName: "workpulse_notification",
          whatsappTemplateLanguage: "en_US",
        },
      });

      const config = await loadWhatsAppConfig(companyId);
      expect(config).toEqual({
        phoneNumberId: "123456789012345",
        accessToken: "EAAa1b2c3d4e5f6g7h8i9j0",
        templateName: "workpulse_notification",
        templateLanguage: "en_US",
      });
    });

    it("defaults the template name and language when they are left blank", async () => {
      const { companyId } = await createTestCompany();
      await db.company.update({
        where: { id:companyId },
        data: {
          whatsappPhoneNumberId: "123456789012345",
          whatsappAccessTokenEncrypted: encryptWhatsAppAccessToken(
            "EAAa1b2c3d4e5f6g7h8i9j0"
          ),
        },
      });

      const config = await loadWhatsAppConfig(companyId);
      expect(config?.templateName).toBe("workpulse_notification");
      expect(config?.templateLanguage).toBe("en");
    });
  });
});