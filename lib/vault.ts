import type { CredentialAccessStatus } from "@/lib/generated/prisma/enums";

/**
 * Client vault rules (Plan: client vault) — logins, invoices and other
 * secrets the agency holds for its clients, revealed only to vault managers
 * and to people a manager has approved.
 *
 * Pure and dependency-free, like `lib/tasks.ts`/`lib/requests.ts`, so it can
 * be unit-tested and imported by client components; the database half is
 * `lib/vault-data.ts`.
 */

/** Every credential's secret half is sealed under this key (`lib/secret-box.ts`). */
export const VAULT_KEY_ENV = "CLIENT_VAULT_ENCRYPTION_KEY";

export const CREDENTIAL_KINDS = ["text", "file"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type CredentialField = { key: string; value: string };

/** What `ClientCredential.secretEncrypted` holds once opened. */
export type CredentialSecret = {
  fields: CredentialField[];
  remark: string | null;
};

/** What a new text credential starts with — the common social-login shape. */
export const DEFAULT_TEXT_FIELDS: CredentialField[] = [
  { key: "Username", value: "" },
  { key: "Password", value: "" },
];

/**
 * Read a decrypted secret back defensively: it was written by this app, but a
 * malformed row must render as empty rather than crash the page revealing it.
 */
export function parseCredentialSecret(json: string): CredentialSecret {
  try {
    const value = JSON.parse(json) as Partial<CredentialSecret>;
    const fields = Array.isArray(value.fields)
      ? value.fields.filter(
          (field): field is CredentialField =>
            typeof field?.key === "string" && typeof field?.value === "string"
        )
      : [];
    return {
      fields,
      remark: typeof value.remark === "string" ? value.remark : null,
    };
  } catch {
    return { fields: [], remark: null };
  }
}

/**
 * Whether a field's value should start hidden in the viewer. Only a display
 * default — whoever can see the dialog is already allowed to read every value.
 */
export function isSensitiveFieldKey(key: string): boolean {
  return /pass|pin|secret|otp|token|key|cvv/i.test(key);
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * Where the signed-in person stands with one credential: `manage` for a vault
 * manager (sees everything, never asks), otherwise their access row's status,
 * or `none` if they have never asked.
 */
export type CredentialAccessView = "manage" | CredentialAccessStatus | "none";

export function canRevealWith(view: CredentialAccessView): boolean {
  return view === "manage" || view === "Approved";
}

/** A rejection or revocation may be asked again; an open request may not. */
export function canRequestWith(view: CredentialAccessView): boolean {
  return view === "none" || view === "Rejected" || view === "Revoked";
}

/**
 * Split a request for several credentials into rows to create, rows to move
 * back to `Pending`, and ones already pending or approved (left alone).
 */
export function planAccessRequest(
  credentialIds: string[],
  existing: { credentialId: string; status: CredentialAccessStatus }[]
): { toCreate: string[]; toReopen: string[]; alreadyOpen: string[] } {
  const statusById = new Map(
    existing.map((row) => [row.credentialId, row.status])
  );
  const plan = {
    toCreate: [] as string[],
    toReopen: [] as string[],
    alreadyOpen: [] as string[],
  };

  for (const id of new Set(credentialIds)) {
    const status = statusById.get(id);
    if (!status) plan.toCreate.push(id);
    else if (canRequestWith(status)) plan.toReopen.push(id);
    else plan.alreadyOpen.push(id);
  }

  return plan;
}

export const ACCESS_ACTIONS = ["approve", "reject", "revoke"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/**
 * The only moves a vault manager can make on an access row. Each names the
 * state it must start from, which the write checks atomically — so two
 * managers deciding the same request at once cannot both win.
 */
const ACCESS_TRANSITIONS: Record<
  AccessAction,
  {
    from: CredentialAccessStatus;
    to: Exclude<CredentialAccessStatus, "Pending">;
  }
> = {
  approve: { from: "Pending", to: "Approved" },
  reject: { from: "Pending", to: "Rejected" },
  revoke: { from: "Approved", to: "Revoked" },
};

export function accessTransition(action: AccessAction) {
  return ACCESS_TRANSITIONS[action];
}

const ACCESS_STATUS_LABELS: Record<CredentialAccessStatus, string> = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
  Revoked: "Revoked",
};

export function accessStatusLabel(status: CredentialAccessStatus): string {
  return ACCESS_STATUS_LABELS[status];
}
