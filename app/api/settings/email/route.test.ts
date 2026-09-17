import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptEmailApiKey } from "@/lib/company-email-config";
import {
  companyActor,
  createCompanyAccount,
  createTestCompany,
  jsonRequest,
} from "@/lib/test-helpers";
import { PATCH } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("PATCH /api/settings/email", () => {
  beforeAll(() => {
    process.env.EMAIL_CONFIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    );
  });

  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("saves the provider, from address and encrypted key for the owner", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "brevo",
        emailFromAddress: "Acme <noreply@acme.com>",
        emailApiKey: "brevo-secret-key",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      emailProvider: "brevo",
      emailFromAddress: "Acme <noreply@acme.com>",
      emailApiKeySet: true,
    });

    const stored = await db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { emailApiKeyEncrypted: true },
    });
    expect(
      decryptEmailApiKey(stored.emailApiKeyEncrypted!)
    ).toBe("brevo-secret-key");
  });

  it("keeps the existing key when emailApiKey is left blank", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "resend",
        emailFromAddress: "First <first@example.com>",
        emailApiKey: "first-key",
      })
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "resend",
        emailFromAddress: "Second <second@example.com>",
        emailApiKey: "",
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.emailFromAddress).toBe("Second <second@example.com>");
    expect(body.emailApiKeySet).toBe(true);

    const stored = await db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { emailApiKeyEncrypted: true },
    });
    expect(decryptEmailApiKey(stored.emailApiKeyEncrypted!)).toBe("first-key");
  });

  it("rejects a non-owner company actor", async () => {
    const { companyId } = await createTestCompany();
    const adminId = await createCompanyAccount(companyId, "Admin");
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, adminId, "Admin")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "resend",
        emailFromAddress: "a@example.com",
        emailApiKey: "some-key",
      })
    );

    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getActor).mockResolvedValue(null);

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "resend",
        emailFromAddress: "a@example.com",
        emailApiKey: "some-key",
      })
    );

    expect(response.status).toBe(401);
  });

  it("validates the payload", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(
      companyActor(companyId, ownerId, "Owner")
    );

    const response = await PATCH(
      jsonRequest("http://localhost/api/settings/email", "PATCH", {
        emailProvider: "mailgun",
        emailFromAddress: "",
      })
    );

    expect(response.status).toBe(400);
  });
});
