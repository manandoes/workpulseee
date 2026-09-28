import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  notifyVaultAccessDecided,
  notifyVaultAccessRequested,
} from "@/lib/notification-data";
import {
  companyActor,
  createClient,
  createCompanyAccount,
  createEmployee,
  createTestCompany,
  employeeActor,
  jsonRequest,
} from "@/lib/test-helpers";
import type { SessionActor } from "@/lib/permissions";
import { POST as requestAccess } from "./route";
import { PATCH as decideAccess } from "./[id]/route";
import { POST as createCredential } from "../credentials/route";
import { GET as revealCredential } from "../credentials/[id]/route";
import { GET as downloadFile } from "../credentials/[id]/file/route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));
// Stubbed so a test run never emails or messages the fixtures' addresses,
// and so each test can assert who was told.
vi.mock("@/lib/notification-data", () => ({
  notifyVaultAccessRequested: vi.fn(),
  notifyVaultAccessDecided: vi.fn(),
}));

/**
 * The client vault end to end (Plan: client vault): a manager stores a
 * credential, an employee asks for it, and only once approved can they read
 * it — until it is revoked.
 */

function signIn(actor: SessionActor) {
  vi.mocked(getActor).mockResolvedValue(actor);
}

async function storeCredential(
  clientId: string,
  payload: Record<string, unknown>,
  file?: File
) {
  const form = new FormData();
  form.append("payload", JSON.stringify({ clientId, remark: "", ...payload }));
  if (file) form.append("file", file);
  const response = await createCredential(
    new Request("http://localhost/api/vault/credentials", {
      method: "POST",
      body: form,
    })
  );
  return { response, body: await response.json() };
}

async function setup() {
  const { companyId } = await createTestCompany();
  const managerId = await createCompanyAccount(companyId, "Manager");
  const employeeId = await createEmployee(companyId);
  const clientId = await createClient(companyId);
  const manager = companyActor(companyId, managerId, "Manager");
  const employee = employeeActor(companyId, employeeId);

  signIn(manager);
  const instagram = await storeCredential(clientId, {
    title: "Instagram",
    kind: "text",
    fields: [
      { key: "Username", value: "acme.brand" },
      { key: "Password", value: "s3cret-pass" },
    ],
    remark: "2FA on the client's phone",
  });
  const invoice = await storeCredential(
    clientId,
    { title: "March invoice", kind: "file", fields: [] },
    new File(["invoice body"], "march.pdf", { type: "application/pdf" })
  );

  return {
    companyId,
    clientId,
    manager,
    employee,
    instagramId: instagram.body.credential.id as string,
    invoiceId: invoice.body.credential.id as string,
  };
}

function reveal(id: string) {
  return revealCredential(new Request(`http://localhost/x`), {
    params: Promise.resolve({ id }),
  });
}

function decide(id: string, action: string) {
  return decideAccess(
    jsonRequest(`http://localhost/api/vault/access/${id}`, "PATCH", { action }),
    { params: Promise.resolve({ id }) }
  );
}

async function accessRow(credentialId: string, employeeId: string) {
  return db.clientCredentialAccess.findFirstOrThrow({
    where: { credentialId, requesterEmployeeId: employeeId },
    select: { id: true, status: true },
  });
}

describe("client vault", () => {
  beforeAll(() => {
    process.env.CLIENT_VAULT_ENCRYPTION_KEY ??= Buffer.alloc(32, 11).toString(
      "base64"
    );
  });

  beforeEach(() => {
    vi.mocked(getActor).mockReset();
    vi.mocked(notifyVaultAccessRequested).mockReset();
    vi.mocked(notifyVaultAccessDecided).mockReset();
  });

  it("stores credentials encrypted — no plaintext in the database", async () => {
    const { instagramId, invoiceId } = await setup();

    const rows = await db.clientCredential.findMany({
      where: { id: { in: [instagramId, invoiceId] } },
      select: { secretEncrypted: true, fileEncrypted: true },
    });
    for (const row of rows) {
      expect(row.secretEncrypted).not.toContain("s3cret-pass");
      expect(row.secretEncrypted).not.toContain("acme.brand");
      if (row.fileEncrypted) {
        expect(Buffer.from(row.fileEncrypted).toString()).not.toContain(
          "invoice body"
        );
      }
    }
  });

  it("refuses to show a credential before access is approved", async () => {
    const { employee, instagramId } = await setup();
    signIn(employee);

    expect((await reveal(instagramId)).status).toBe(403);
  });

  it("request → approve → view → revoke", async () => {
    const { employee, manager, instagramId, invoiceId } = await setup();

    signIn(employee);
    const requested = await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", {
        credentialIds: [instagramId, invoiceId],
        reason: "Posting the launch campaign",
      })
    );
    expect(requested.status).toBe(201);
    expect(await requested.json()).toEqual({ requested: 2, alreadyOpen: 0 });
    expect(notifyVaultAccessRequested).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(notifyVaultAccessRequested).mock.calls[0][0].titles.sort()
    ).toEqual(["Instagram", "March invoice"]);

    const row = await accessRow(instagramId, employee.id);
    expect(row.status).toBe("Pending");

    signIn(manager);
    expect((await decide(row.id, "approve")).status).toBe(200);
    expect(notifyVaultAccessDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: { employeeId: employee.id },
        status: "Approved",
      })
    );
    // A second manager deciding the same request a moment later loses.
    expect((await decide(row.id, "approve")).status).toBe(409);

    signIn(employee);
    const shown = await reveal(instagramId);
    expect(shown.status).toBe(200);
    const { credential } = await shown.json();
    expect(credential.fields).toEqual([
      { key: "Username", value: "acme.brand" },
      { key: "Password", value: "s3cret-pass" },
    ]);
    expect(credential.remark).toBe("2FA on the client's phone");

    // The invoice is still pending, so its document stays locked.
    const locked = await downloadFile(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: invoiceId }),
    });
    expect(locked.status).toBe(404);

    signIn(manager);
    expect((await decide(row.id, "revoke")).status).toBe(200);

    signIn(employee);
    expect((await reveal(instagramId)).status).toBe(403);
  });

  it("lets an approved requester download a file credential", async () => {
    const { employee, manager, invoiceId } = await setup();

    signIn(employee);
    await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", {
        credentialIds: [invoiceId],
      })
    );
    const row = await accessRow(invoiceId, employee.id);
    signIn(manager);
    await decide(row.id, "approve");

    signIn(employee);
    const response = await downloadFile(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: invoiceId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("march.pdf");
    expect(await response.text()).toBe("invoice body");
  });

  it("does not stack duplicate requests, but allows asking again after a rejection", async () => {
    const { employee, manager, instagramId } = await setup();
    const body = { credentialIds: [instagramId] };

    signIn(employee);
    await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", body)
    );
    const again = await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", body)
    );
    expect(again.status).toBe(409);

    const row = await accessRow(instagramId, employee.id);
    signIn(manager);
    await decide(row.id, "reject");

    signIn(employee);
    const retry = await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", body)
    );
    expect(retry.status).toBe(201);
    expect((await accessRow(instagramId, employee.id)).status).toBe("Pending");
  });

  it("keeps each role on its side of the vault", async () => {
    const { companyId, employee, manager, instagramId } = await setup();

    signIn(manager);
    const managerRequest = await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", {
        credentialIds: [instagramId],
      })
    );
    expect(managerRequest.status).toBe(403);
    expect((await reveal(instagramId)).status).toBe(200);

    signIn(employee);
    await requestAccess(
      jsonRequest("http://localhost/api/vault/access", "POST", {
        credentialIds: [instagramId],
      })
    );
    const row = await accessRow(instagramId, employee.id);
    expect((await decide(row.id, "approve")).status).toBe(403);

    const hrId = await createCompanyAccount(companyId, "HRHead");
    signIn(companyActor(companyId, hrId, "HRHead"));
    const { response } = await storeCredential("irrelevant", {
      title: "Nope",
      kind: "text",
      fields: [{ key: "a", value: "b" }],
    });
    expect(response.status).toBe(403);
  });

  it("never reveals another company's credential", async () => {
    const { instagramId } = await setup();
    const other = await createTestCompany();
    signIn(companyActor(other.companyId, other.ownerId, "Owner"));

    expect((await reveal(instagramId)).status).toBe(404);
  });
});
