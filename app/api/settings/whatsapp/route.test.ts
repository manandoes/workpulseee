import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  decryptWhatsAppAccessToken,
  encryptWhatsAppAccessToken,
} from "@/lib/company-whatsapp-config";
import {
  companyActor,
  createCompanyAccount,
  createTestCompany,
  jsonRequest,
} from "@/lib/test-helpers";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("PATCH /api/settings/whatsapp", () => {
  beforeAll(() => {
    process.env.WHATSAPP_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    );
  });

  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("saves the phone number ID, template and encrypted token for the owner", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/whatsapp", "PATCH", {
        whatsappPhoneNumberId: "123456789012345",
        whatsappAccessToken: "EAAa1b2c3d4e5f6g7h8i9j0",
        whatsappTemplateName: "workpulse_notification",
        whatsappTemplateLanguage: "en_US",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      whatsappPhoneNumberId: "123456789012345",
      whatsappAccessTokenSet: true,
      whatsappTemplateName: "workpulse_notification",
      whatsappTemplateLanguage: "en_US",
    });

    const stored = await db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        whatsappPhoneNumberId: true,
        whatsappAccessTokenEncrypted: true,
        whatsappTemplateName: true,
        whatsappTemplateLanguage: true,
      },
    });
    expect(stored.whatsappPhoneNumberId).toBe("123456789012345");
    expect(stored.whatsappTemplateName).toBe("workpulse_notification");
    expect(stored.whatsappTemplateLanguage).toBe("en_US");
    expect(
      decryptWhatsAppAccessToken(stored.whatsappAccessTokenEncrypted!)
    ).toBe("EAAa1b2c3d4e5f6g7h8i9j0");
  });

  it("keeps the existing token when whatsappAccessToken is left blank", async () => {
    const { ownerId, companyId } = await createTestCompany();

    // Seed the company with a token first.
    await db.company.update({
      where: { id: companyId },
      data: {
        whatsappPhoneNumberId: "111111111111111",
        whatsappAccessTokenEncrypted: encryptWhatsAppAccessToken(
          "EAAa00000000000000000000"
        ),
        whatsappTemplateName: "workpulse_notification",
        whatsappTemplateLanguage: "en",
      },
    });

    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/whatsapp", "PATCH", {
        whatsappPhoneNumberId: "222222222222222",
        whatsappAccessToken: "",
        whatsappTemplateName: "workpulse_notification",
        whatsappTemplateLanguage: "en",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.whatsappPhoneNumberId).toBe("222222222222222");
    expect(body.whatsappAccessTokenSet).toBe(true);

    const stored = await db.company.findUniqueOrThrow({
      where: { id:companyId },
      select: { whatsappAccessTokenEncrypted: true },
    });
    expect(decryptWhatsAppAccessToken(stored.whatsappAccessTokenEncrypted!)).toBe(
      "EAAa00000000000000000000"
    );
  });

  it("rejects a non-owner company actor", async () => {
    const { companyId } = await createTestCompany();
    const adminId = await createCompanyAccount(companyId, "Admin");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, adminId, "Admin")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/whatsapp", "PATCH", {
        whatsappPhoneNumberId: "123456789012345",
        whatsappAccessToken: "some-token",
        whatsappTemplateName: "workpulse_notification",
        whatsappTemplateLanguage: "en",
      })
    );

    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getActor).mockResolvedValue(null);

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/whatsapp", "PATCH", {
        whatsappPhoneNumberId: "123456789012345",
        whatsappAccessToken: "some-token",
        whatsappTemplateName: "workpulse_notification",
        whatsappTemplateLanguage: "en",
      })
    );

    expect(response.status).toBe(401);
  });

  it("validates the payload", async () => {
    const { ownerId, companyId } = await createTestCompany();

    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/whatsapp", "PATCH", {
        whatsappPhoneNumberId: "abc",
        whatsappTemplateName: "Bad Template!",
        whatsappTemplateLanguage: "english",
      })
    );

    expect(response.status).toBe(400);
  });
});