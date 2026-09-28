import { describe, expect, it } from "vitest";
import {
  accessTransition,
  canRequestWith,
  canRevealWith,
  isSensitiveFieldKey,
  parseCredentialSecret,
  planAccessRequest,
} from "@/lib/vault";
import {
  canManageClientVault,
  canRequestVaultAccess,
  type SessionActor,
} from "@/lib/permissions";
import {
  resolveChannels,
  vaultAccessDecidedMessage,
  vaultAccessRequestedMessage,
} from "@/lib/notifications";
import { credentialFormSchema } from "@/lib/validations/vault";

/**
 * Client vault rules (Plan: client vault) — who may see a credential, what a
 * request turns into, and which moves a manager may make. These decide who
 * reads a client's passwords, so they are covered directly.
 */

function actor(
  role: SessionActor["role"],
  accountType: SessionActor["accountType"] = "company"
): SessionActor {
  return {
    id: "a1",
    companyId: "c1",
    role,
    accountType,
    grants: [],
    revokes: [],
  };
}

describe("vault permissions", () => {
  it("lets Owner, Admin and Manager run the vault", () => {
    expect(canManageClientVault(actor("Owner"))).toBe(true);
    expect(canManageClientVault(actor("Admin"))).toBe(true);
    expect(canManageClientVault(actor("Manager"))).toBe(true);
  });

  it("makes HR and employees request instead", () => {
    expect(canManageClientVault(actor("HRHead"))).toBe(false);
    expect(canRequestVaultAccess(actor("HRHead"))).toBe(true);
    expect(canManageClientVault(actor("HRTeam"))).toBe(false);
    expect(canManageClientVault(actor("Employee", "employee"))).toBe(false);
    expect(canRequestVaultAccess(actor("Employee", "employee"))).toBe(true);
  });

  it("is not handed to an employee by any grant", () => {
    const granted: SessionActor = {
      ...actor("Employee", "employee"),
      grants: ["ManageProjects", "ManageEmployees", "DecideRequests"],
    };
    expect(canManageClientVault(granted)).toBe(false);
  });

  it("never asks a manager to request", () => {
    expect(canRequestVaultAccess(actor("Manager"))).toBe(false);
  });
});

describe("canRevealWith / canRequestWith", () => {
  it("reveals only to a manager or approved access", () => {
    expect(canRevealWith("manage")).toBe(true);
    expect(canRevealWith("Approved")).toBe(true);
    for (const view of ["none", "Pending", "Rejected", "Revoked"] as const) {
      expect(canRevealWith(view)).toBe(false);
    }
  });

  it("allows asking again after a rejection or revocation, not while open", () => {
    expect(canRequestWith("none")).toBe(true);
    expect(canRequestWith("Rejected")).toBe(true);
    expect(canRequestWith("Revoked")).toBe(true);
    expect(canRequestWith("Pending")).toBe(false);
    expect(canRequestWith("Approved")).toBe(false);
    expect(canRequestWith("manage")).toBe(false);
  });
});

describe("planAccessRequest", () => {
  it("creates new rows, reopens closed ones, and leaves open ones alone", () => {
    const plan = planAccessRequest(
      ["new", "rejected", "revoked", "pending", "approved"],
      [
        { credentialId: "rejected", status: "Rejected" },
        { credentialId: "revoked", status: "Revoked" },
        { credentialId: "pending", status: "Pending" },
        { credentialId: "approved", status: "Approved" },
      ]
    );

    expect(plan.toCreate).toEqual(["new"]);
    expect(plan.toReopen).toEqual(["rejected", "revoked"]);
    expect(plan.alreadyOpen).toEqual(["pending", "approved"]);
  });

  it("counts a credential picked twice once", () => {
    const plan = planAccessRequest(["a", "a"], []);
    expect(plan.toCreate).toEqual(["a"]);
  });
});

describe("accessTransition", () => {
  it("approves and rejects only pending requests, revokes only approved access", () => {
    expect(accessTransition("approve")).toEqual({
      from: "Pending",
      to: "Approved",
    });
    expect(accessTransition("reject")).toEqual({
      from: "Pending",
      to: "Rejected",
    });
    expect(accessTransition("revoke")).toEqual({
      from: "Approved",
      to: "Revoked",
    });
  });
});

describe("parseCredentialSecret", () => {
  it("round-trips what the vault writes", () => {
    const secret = {
      fields: [{ key: "Password", value: " spaced " }],
      remark: "2FA on the client's phone",
    };
    expect(parseCredentialSecret(JSON.stringify(secret))).toEqual(secret);
  });

  it("reads a malformed value as empty rather than throwing", () => {
    expect(parseCredentialSecret("not json")).toEqual({
      fields: [],
      remark: null,
    });
    expect(
      parseCredentialSecret(JSON.stringify({ fields: [{ key: 1 }] }))
    ).toEqual({ fields: [], remark: null });
  });
});

describe("isSensitiveFieldKey", () => {
  it("hides passwords, PINs and keys by default but not usernames", () => {
    expect(isSensitiveFieldKey("Password")).toBe(true);
    expect(isSensitiveFieldKey("Account PIN")).toBe(true);
    expect(isSensitiveFieldKey("API key")).toBe(true);
    expect(isSensitiveFieldKey("Username")).toBe(false);
    expect(isSensitiveFieldKey("Handle")).toBe(false);
  });
});

describe("credentialFormSchema", () => {
  it("requires at least one field for a text credential", () => {
    const result = credentialFormSchema.safeParse({
      title: "Instagram",
      kind: "text",
      fields: [],
      remark: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a file credential with no fields", () => {
    const result = credentialFormSchema.safeParse({
      title: "March invoice",
      kind: "file",
      fields: [],
      remark: "",
    });
    expect(result.success).toBe(true);
  });

  it("keeps a value's surrounding spaces — they may be part of a password", () => {
    const result = credentialFormSchema.parse({
      title: "Portal",
      kind: "text",
      fields: [{ key: " Password ", value: " p@ss " }],
      remark: "",
    });
    expect(result.fields[0]).toEqual({ key: "Password", value: " p@ss " });
  });
});

describe("vault notifications", () => {
  it("names up to three credentials and counts the rest", () => {
    expect(
      vaultAccessRequestedMessage("Asha", "Acme", ["Instagram", "Facebook"])
    ).toBe("Asha requested access to Acme credentials: Instagram, Facebook");
    expect(
      vaultAccessRequestedMessage("Asha", "Acme", ["A", "B", "C", "D", "E"])
    ).toBe("Asha requested access to Acme credentials: A, B, C and 2 more");
  });

  it("tells the requester what happened", () => {
    expect(vaultAccessDecidedMessage("Acme", "Instagram", "Revoked")).toBe(
      "Your access to Acme · Instagram was revoked."
    );
  });

  it("keeps requests to the approver-queue channels", () => {
    const contact = {
      email: "a@example.com",
      phone: "+919876543210",
      hasPushSubscription: true,
    };
    expect(resolveChannels("VaultAccessRequested", null, contact)).toEqual([
      "InApp",
      "Push",
    ]);
    expect(resolveChannels("VaultAccessDecided", null, contact)).toEqual([
      "InApp",
      "Push",
      "Email",
      "WhatsApp",
    ]);
  });
});
