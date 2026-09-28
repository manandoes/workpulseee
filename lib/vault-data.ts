import { db } from "@/lib/db";
import {
  duplicateFailure,
  invalidReference,
  type WriteFailure,
} from "@/lib/api";
import { canManageClientVault, type SessionActor } from "@/lib/permissions";
import { checkUpload } from "@/lib/files-data";
import { MAX_FILE_BYTES, sanitizeFileName } from "@/lib/files";
import { openBytes, openString, sealBytes, sealString } from "@/lib/secret-box";
import {
  accessTransition,
  parseCredentialSecret,
  planAccessRequest,
  VAULT_KEY_ENV,
  type AccessAction,
  type CredentialAccessView,
  type CredentialField,
  type CredentialKind,
  type CredentialSecret,
} from "@/lib/vault";
import {
  notifyVaultAccessDecided,
  notifyVaultAccessRequested,
} from "@/lib/notification-data";
import type {
  CreateCredentialInput,
  CredentialFormInput,
  RequestAccessInput,
} from "@/lib/validations/vault";
import type {
  ClientStatus,
  CredentialAccessStatus,
} from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS } from "@/lib/permission-grants";

/**
 * Database access for the client vault (Plan: client vault).
 *
 * Every query filters by the actor's own `companyId` (Rules.md section 2),
 * and nothing secret leaves this file unless `mayReveal` said yes: a vault
 * manager, or someone holding an `Approved` access row for that credential.
 * Titles are the one exception — they are what a requester chooses from.
 */

const notFound = (message: string): WriteFailure => ({
  ok: false,
  status: 404,
  code: "not_found",
  message,
});

const conflict = (message: string): WriteFailure => ({
  ok: false,
  status: 409,
  code: "conflict",
  message,
});

/** Which requester column is this actor's — the usual "exactly one of" pair. */
function requesterColumns(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { requesterEmployeeId: actor.id }
    : { requesterAccountId: actor.id };
}

function kindOf(credential: { fileName: string | null }): CredentialKind {
  return credential.fileName === null ? "text" : "file";
}

// ---------------------------------------------------------------------------
// The browser: clients -> credential titles, with where the actor stands
// ---------------------------------------------------------------------------

export type VaultBrowserCredential = {
  id: string;
  title: string;
  kind: CredentialKind;
  access: CredentialAccessView;
};

export type VaultBrowserClient = {
  id: string;
  name: string;
  archived: boolean;
  credentials: VaultBrowserCredential[];
};

export type VaultBrowser = {
  canManage: boolean;
  /** Requests waiting on a decision — only counted for a vault manager. */
  pendingCount: number;
  clients: VaultBrowserClient[];
};

/**
 * Every client holding at least one credential — current clients first, then
 * archived ("past") ones — with each credential's title and the actor's own
 * access to it. Used by the top-bar key menu and the requester's `/vault`.
 */
export async function loadVaultBrowser(
  actor: SessionActor
): Promise<VaultBrowser> {
  const canManage = canManageClientVault(actor);

  const [clients, accessRows, pendingCount] = await Promise.all([
    db.client.findMany({
      where: {
        companyId: actor.companyId,
        deletedAt: null,
        credentials: { some: {} },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        credentials: {
          orderBy: { title: "asc" },
          select: { id: true, title: true, fileName: true },
        },
      },
    }),
    canManage
      ? Promise.resolve([])
      : db.clientCredentialAccess.findMany({
          where: { companyId: actor.companyId, ...requesterColumns(actor) },
          select: { credentialId: true, status: true },
        }),
    canManage
      ? db.clientCredentialAccess.count({
          where: { companyId: actor.companyId, status: "Pending" },
        })
      : Promise.resolve(0),
  ]);

  const statusById = new Map(
    accessRows.map((row) => [row.credentialId, row.status])
  );

  return {
    canManage,
    pendingCount,
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      archived: client.status === "Archived",
      credentials: client.credentials.map((credential) => ({
        id: credential.id,
        title: credential.title,
        kind: kindOf(credential),
        access: canManage
          ? "manage"
          : (statusById.get(credential.id) ?? "none"),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Revealing a credential
// ---------------------------------------------------------------------------

/** A vault manager, or someone a manager has approved for this credential. */
async function mayReveal(
  actor: SessionActor,
  credentialId: string
): Promise<boolean> {
  if (canManageClientVault(actor)) return true;

  const approved = await db.clientCredentialAccess.findFirst({
    where: {
      companyId: actor.companyId,
      credentialId,
      status: "Approved",
      ...requesterColumns(actor),
    },
    select: { id: true },
  });
  return approved !== null;
}

export type RevealedCredential = {
  id: string;
  title: string;
  clientName: string;
  kind: CredentialKind;
  fields: CredentialField[];
  remark: string | null;
  file: { name: string; mimeType: string; sizeBytes: number } | null;
  updatedAt: Date;
};

export type RevealResult =
  { ok: true; credential: RevealedCredential } | WriteFailure;

export async function revealCredential(
  actor: SessionActor,
  credentialId: string
): Promise<RevealResult> {
  const credential = await db.clientCredential.findFirst({
    where: { id: credentialId, companyId: actor.companyId },
    select: {
      id: true,
      title: true,
      secretEncrypted: true,
      fileName: true,
      fileMimeType: true,
      fileSizeBytes: true,
      updatedAt: true,
      client: { select: { name: true } },
    },
  });
  if (!credential) return notFound("That credential does not exist.");

  if (!(await mayReveal(actor, credentialId))) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "You need approved access to view this credential.",
    };
  }

  const secret = parseCredentialSecret(
    openString(credential.secretEncrypted, VAULT_KEY_ENV)
  );

  return {
    ok: true,
    credential: {
      id: credential.id,
      title: credential.title,
      clientName: credential.client.name,
      kind: kindOf(credential),
      fields: secret.fields,
      remark: secret.remark,
      file:
        credential.fileName !== null
          ? {
              name: credential.fileName,
              mimeType: credential.fileMimeType ?? "application/octet-stream",
              sizeBytes: credential.fileSizeBytes ?? 0,
            }
          : null,
      updatedAt: credential.updatedAt,
    },
  };
}

/**
 * The decrypted document of a file credential, or null when it does not
 * exist, is not a file credential, or the actor may not reveal it — all three
 * read the same to the caller, so a download URL confirms nothing.
 */
export async function loadCredentialFile(
  actor: SessionActor,
  credentialId: string
): Promise<{ name: string; mimeType: string; data: Uint8Array } | null> {
  const credential = await db.clientCredential.findFirst({
    where: { id: credentialId, companyId: actor.companyId },
    select: { fileName: true, fileMimeType: true, fileEncrypted: true },
  });
  if (
    !credential?.fileName ||
    !credential.fileMimeType ||
    !credential.fileEncrypted
  ) {
    return null;
  }
  if (!(await mayReveal(actor, credentialId))) return null;

  return {
    name: credential.fileName,
    mimeType: credential.fileMimeType,
    data: openBytes(credential.fileEncrypted, VAULT_KEY_ENV),
  };
}

// ---------------------------------------------------------------------------
// Storing credentials (vault managers only — the routes check that)
// ---------------------------------------------------------------------------

export type CredentialUpload = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

/**
 * Split the credential form's multipart body into its JSON `payload` (still
 * unvalidated — the route runs it through Zod) and the optional `file`.
 * Multipart because a file credential carries up to 5 MB, the same reason
 * `/api/files` is multipart. The size is checked before the bytes are read.
 */
export async function readCredentialForm(
  form: FormData
): Promise<
  { ok: true; payload: unknown; upload: CredentialUpload | null } | WriteFailure
> {
  let payload: unknown = null;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    // Left null: the schema rejects it with a proper validation error.
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: true, payload, upload: null };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "file_too_large",
      field: "file",
      message: "That file is larger than 5 MB.",
    };
  }

  return {
    ok: true,
    payload,
    upload: {
      name: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    },
  };
}

type SecretColumns = {
  secretEncrypted: string;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  fileEncrypted?: Uint8Array<ArrayBuffer> | null;
};

/**
 * The encrypted columns for a form submission. A text credential clears any
 * file it used to have; a file credential needs a new upload unless it is an
 * edit that keeps the file already stored (`hasStoredFile`).
 */
function secretColumns(
  input: CredentialFormInput,
  upload: CredentialUpload | null,
  hasStoredFile: boolean
): { ok: true; data: SecretColumns } | WriteFailure {
  const secret: CredentialSecret = {
    fields: input.kind === "text" ? input.fields : [],
    remark: input.remark || null,
  };
  const secretEncrypted = sealString(JSON.stringify(secret), VAULT_KEY_ENV);

  if (input.kind === "text") {
    return {
      ok: true,
      data: {
        secretEncrypted,
        fileName: null,
        fileMimeType: null,
        fileSizeBytes: null,
        fileEncrypted: null,
      },
    };
  }

  if (!upload) {
    return hasStoredFile
      ? { ok: true, data: { secretEncrypted } }
      : invalidReference("file", "Choose a file to upload.");
  }

  const rejected = checkUpload(upload);
  if (rejected) return rejected;

  return {
    ok: true,
    data: {
      secretEncrypted,
      fileName: sanitizeFileName(upload.name),
      fileMimeType: upload.mimeType,
      fileSizeBytes: upload.bytes.byteLength,
      fileEncrypted: new Uint8Array(sealBytes(upload.bytes, VAULT_KEY_ENV)),
    },
  };
}

async function titleTaken(
  clientId: string,
  title: string,
  exceptId?: string
): Promise<boolean> {
  const clash = await db.clientCredential.findFirst({
    where: { clientId, title, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return clash !== null;
}

const DUPLICATE_TITLE = "This client already has a credential with that title.";

export type CredentialWriteResult =
  { ok: true; credential: { id: string; title: string } } | WriteFailure;

export async function createCredential(
  actor: SessionActor,
  input: CreateCredentialInput,
  upload: CredentialUpload | null
): Promise<CredentialWriteResult> {
  const client = await db.client.findFirst({
    where: { id: input.clientId, companyId: actor.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return invalidReference("clientId", "That client does not exist.");
  }

  if (await titleTaken(client.id, input.title)) {
    return duplicateFailure("title", DUPLICATE_TITLE);
  }

  const columns = secretColumns(input, upload, false);
  if (!columns.ok) return columns;

  const credential = await db.clientCredential.create({
    data: {
      companyId: actor.companyId,
      clientId: client.id,
      title: input.title,
      createdById: actor.accountType === "company" ? actor.id : null,
      ...columns.data,
    },
    select: { id: true, title: true },
  });

  return { ok: true, credential };
}

export async function updateCredential(
  actor: SessionActor,
  credentialId: string,
  input: CredentialFormInput,
  upload: CredentialUpload | null
): Promise<CredentialWriteResult> {
  const existing = await db.clientCredential.findFirst({
    where: { id: credentialId, companyId: actor.companyId },
    select: { id: true, clientId: true, fileName: true },
  });
  if (!existing) return notFound("That credential does not exist.");

  if (await titleTaken(existing.clientId, input.title, existing.id)) {
    return duplicateFailure("title", DUPLICATE_TITLE);
  }

  const columns = secretColumns(input, upload, existing.fileName !== null);
  if (!columns.ok) return columns;

  const credential = await db.clientCredential.update({
    where: { id: existing.id },
    data: { title: input.title, ...columns.data },
    select: { id: true, title: true },
  });

  return { ok: true, credential };
}

/**
 * Removes the credential and, by cascade, every access row to it — the secret
 * is actually destroyed rather than hidden, which is what deleting a password
 * from a vault should mean.
 */
export async function deleteCredential(
  actor: SessionActor,
  credentialId: string
): Promise<boolean> {
  const { count } = await db.clientCredential.deleteMany({
    where: { id: credentialId, companyId: actor.companyId },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// Asking for access, and deciding
// ---------------------------------------------------------------------------

async function actorName(actor: SessionActor): Promise<string> {
  const person =
    actor.accountType === "employee"
      ? await db.employee.findFirst({
          where: { id: actor.id, companyId: actor.companyId },
          select: { fullName: true },
        })
      : await db.companyAccount.findFirst({
          where: { id: actor.id, companyId: actor.companyId },
          select: { fullName: true },
        });
  return person?.fullName ?? "Someone";
}

export type RequestAccessResult =
  { ok: true; requested: number; alreadyOpen: number } | WriteFailure;

/**
 * Ask for one or more credentials of a single client. Credentials never
 * asked for get a new row; rejected or revoked ones move back to `Pending`;
 * ones already pending or approved are left alone. Vault managers hear about
 * it once, however many credentials it covers.
 */
export async function requestCredentialAccess(
  actor: SessionActor,
  input: RequestAccessInput
): Promise<RequestAccessResult> {
  const ids = [...new Set(input.credentialIds)];

  const credentials = await db.clientCredential.findMany({
    where: { id: { in: ids }, companyId: actor.companyId },
    select: {
      id: true,
      title: true,
      clientId: true,
      client: { select: { name: true } },
    },
  });
  if (credentials.length !== ids.length) {
    return invalidReference(
      "credentialIds",
      "One of those credentials no longer exists."
    );
  }
  if (new Set(credentials.map((c) => c.clientId)).size > 1) {
    return invalidReference(
      "credentialIds",
      "Request credentials from one client at a time."
    );
  }

  const existing = await db.clientCredentialAccess.findMany({
    where: {
      companyId: actor.companyId,
      credentialId: { in: ids },
      ...requesterColumns(actor),
    },
    select: { credentialId: true, status: true },
  });
  const plan = planAccessRequest(ids, existing);

  if (plan.toCreate.length === 0 && plan.toReopen.length === 0) {
    return conflict(
      "You already have access to, or a pending request for, those credentials."
    );
  }

  const reason = input.reason?.trim() || null;
  const requester = requesterColumns(actor);

  await db.$transaction([
    ...(plan.toCreate.length > 0
      ? [
          // `skipDuplicates` absorbs a double-submit racing this one: the
          // unique (credential, requester) pair means the loser creates
          // nothing.
          db.clientCredentialAccess.createMany({
            data: plan.toCreate.map((credentialId) => ({
              companyId: actor.companyId,
              credentialId,
              reason,
              ...requester,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(plan.toReopen.length > 0
      ? [
          // Conditional on the state `planAccessRequest` saw, so a row a
          // manager approved in the meantime is never knocked back to
          // `Pending`.
          db.clientCredentialAccess.updateMany({
            where: {
              companyId: actor.companyId,
              credentialId: { in: plan.toReopen },
              status: { in: ["Rejected", "Revoked"] },
              ...requester,
            },
            data: {
              status: "Pending",
              reason,
              requestedAt: new Date(),
              decidedById: null,
              decidedAt: null,
            },
          }),
        ]
      : []),
  ]);

  const requestedIds = new Set([...plan.toCreate, ...plan.toReopen]);
  await notifyVaultAccessRequested({
    companyId: actor.companyId,
    requesterName: await actorName(actor),
    clientName: credentials[0].client.name,
    titles: credentials
      .filter((credential) => requestedIds.has(credential.id))
      .map((credential) => credential.title),
  });

  return {
    ok: true,
    requested: requestedIds.size,
    alreadyOpen: plan.alreadyOpen.length,
  };
}

export type DecideAccessResult =
  { ok: true; status: CredentialAccessStatus } | WriteFailure;

/**
 * Approve or reject a pending request, or revoke approved access. The update
 * only matches a row still in the state the action starts from, so a second
 * manager acting on the same row a moment later gets a 409, not a silent
 * overwrite.
 */
export async function decideCredentialAccess(
  actor: SessionActor,
  accessId: string,
  action: AccessAction
): Promise<DecideAccessResult> {
  const row = await db.clientCredentialAccess.findFirst({
    where: { id: accessId, companyId: actor.companyId },
    select: {
      requesterEmployeeId: true,
      requesterAccountId: true,
      credential: {
        select: { title: true, client: { select: { name: true } } },
      },
    },
  });
  if (!row) return notFound("That access request does not exist.");

  const { from, to } = accessTransition(action);
  const { count } = await db.clientCredentialAccess.updateMany({
    where: { id: accessId, companyId: actor.companyId, status: from },
    data: { status: to, decidedById: actor.id, decidedAt: new Date() },
  });
  if (count === 0) {
    return conflict(
      action === "revoke"
        ? "That access is no longer active."
        : "That request has already been decided."
    );
  }

  const recipient = row.requesterEmployeeId
    ? { employeeId: row.requesterEmployeeId }
    : row.requesterAccountId
      ? { accountId: row.requesterAccountId }
      : null;
  if (recipient) {
    await notifyVaultAccessDecided({
      companyId: actor.companyId,
      recipient,
      clientName: row.credential.client.name,
      title: row.credential.title,
      status: to,
    });
  }

  return { ok: true, status: to };
}

// ---------------------------------------------------------------------------
// Vault manager views
// ---------------------------------------------------------------------------

export type AccessRow = {
  id: string;
  requesterName: string;
  /** "Employee", or the company role (HR) of an account requester. */
  requesterRole: string;
  clientName: string;
  credentialTitle: string;
  reason: string | null;
  requestedAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
};

/**
 * Access rows in one state: `Pending` oldest first (the queue), `Approved`
 * most recently granted first (who holds what).
 */
export async function loadAccessRows(
  actor: SessionActor,
  status: "Pending" | "Approved"
): Promise<AccessRow[]> {
  const rows = await db.clientCredentialAccess.findMany({
    where: { companyId: actor.companyId, status },
    orderBy:
      status === "Pending" ? { requestedAt: "asc" } : { decidedAt: "desc" },
    select: {
      id: true,
      reason: true,
      requestedAt: true,
      decidedAt: true,
      requesterEmployee: { select: { fullName: true } },
      requesterAccount: { select: { fullName: true, role: true } },
      decidedBy: { select: { fullName: true } },
      credential: {
        select: { title: true, client: { select: { name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    requesterName:
      row.requesterEmployee?.fullName ??
      row.requesterAccount?.fullName ??
      "Unknown",
    requesterRole: LEVEL_LABELS[row.requesterAccount?.role ?? "Employee"],
    clientName: row.credential.client.name,
    credentialTitle: row.credential.title,
    reason: row.reason,
    requestedAt: row.requestedAt,
    decidedByName: row.decidedBy?.fullName ?? null,
    decidedAt: row.decidedAt,
  }));
}

export type VaultClientSummary = {
  id: string;
  name: string;
  status: ClientStatus;
  credentialCount: number;
};

/** Every client, for choosing whose credentials to manage. */
export async function loadVaultClients(
  actor: SessionActor
): Promise<VaultClientSummary[]> {
  const clients = await db.client.findMany({
    where: { companyId: actor.companyId, deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { credentials: true } },
    },
  });

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    status: client.status,
    credentialCount: client._count.credentials,
  }));
}

export type ManagedCredential = {
  id: string;
  title: string;
  kind: CredentialKind;
  fileName: string | null;
  fileSizeBytes: number | null;
  updatedAt: Date;
  /** How many people currently hold approved access. */
  approvedCount: number;
};

/** One client's credentials for a vault manager, or null if no such client. */
export async function loadClientVault(
  actor: SessionActor,
  clientId: string
): Promise<{
  client: { id: string; name: string; status: ClientStatus };
  credentials: ManagedCredential[];
} | null> {
  const client = await db.client.findFirst({
    where: { id: clientId, companyId: actor.companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      credentials: {
        orderBy: { title: "asc" },
        select: {
          id: true,
          title: true,
          fileName: true,
          fileSizeBytes: true,
          updatedAt: true,
          _count: { select: { access: { where: { status: "Approved" } } } },
        },
      },
    },
  });
  if (!client) return null;

  return {
    client: { id: client.id, name: client.name, status: client.status },
    credentials: client.credentials.map((credential) => ({
      id: credential.id,
      title: credential.title,
      kind: kindOf(credential),
      fileName: credential.fileName,
      fileSizeBytes: credential.fileSizeBytes,
      updatedAt: credential.updatedAt,
      approvedCount: credential._count.access,
    })),
  };
}
