import { invalidReference, type WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { has, type SessionActor } from "@/lib/permissions";
import { splitOverrides } from "@/lib/permission-grants";
import { paginationMeta, type PaginationMeta } from "@/lib/pagination";
import {
  requestFilter,
  requestNeedsDayPart,
  type RequestFilters,
} from "@/lib/requests";
import type {
  LeaveDayPart,
  RequestStatus,
  RequestType,
} from "@/lib/generated/prisma/enums";
import type { CreateRequestInput } from "@/lib/validations/requests";

/**
 * Uploaded files named on a request write, checked before anything is created.
 *
 * `/api/files` accepts any signed-in upload, so it is the feature referencing
 * a file that authorises using it: each one must be in the actor's company,
 * uploaded by the actor, and not already attached somewhere else.
 */
export async function resolveAttachmentFiles(
  actor: SessionActor,
  fileIds: string[]
): Promise<{ ok: true; files: { id: string; name: string }[] } | WriteFailure> {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return { ok: true, files: [] };

  const files = await db.storedFile.findMany({
    where: {
      id: { in: ids },
      companyId: actor.companyId,
      uploadedByEmployeeId: actor.id,
      attachment: { is: null },
    },
    select: { id: true, name: true },
  });

  if (files.length !== ids.length) {
    return invalidReference(
      "attachmentFileIds",
      "One of those files could not be attached. Upload it again."
    );
  }

  return { ok: true, files };
}

/**
 * Database access for requests (Phases.md Phase 7).
 *
 * Mirrors `lib/task-data.ts`: write resolution and the reads the pages share
 * live here, so "is this id in my company" and "does this submission carry
 * what its type needs" exist in exactly one place. Every query goes through
 * `scopedWhere` (Rules.md section 2).
 */

// ---------------------------------------------------------------------------
// Write resolution
// ---------------------------------------------------------------------------

export type RequestWriteData = {
  type: RequestType;
  subject: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  dayPart: LeaveDayPart | null;
  amount: string | null;
  /** Phase 21: the approver this request is addressed to. Exactly one is set. */
  requestedApproverAccountId: string | null;
  requestedApproverEmployeeId: string | null;
  /** File ids uploaded alongside the request (e.g. a receipt for reimbursement). */
  attachmentFileIds: string[];
};

export type RequestWriteResolution =
  { ok: true; data: RequestWriteData } | WriteFailure;

/**
 * Resolve a new request's fields.
 *
 * `createRequestSchema`'s `superRefine` already checked that a date range or
 * an amount is present when the type needs one — this only converts the
 * validated strings into the column types, the same split `resolveTaskWrite`
 * draws between "is this shaped right" (the schema) and "what does the
 * database get" (here).
 */
export function resolveRequest(
  input: CreateRequestInput
): RequestWriteResolution {
  const dateOrNull = (value: string) =>
    value ? new Date(`${value}T00:00:00.000Z`) : null;

  // Phase 21: exactly one approver is provided (validated by schema)

  return {
    ok: true,
    data: {
      type: input.type,
      subject: input.subject,
      description: input.description,
      startDate: dateOrNull(input.startDate ?? ""),
      endDate: dateOrNull(input.endDate ?? ""),
      dayPart: requestNeedsDayPart(input.type)
        ? (input.dayPart ?? "FullDay")
        : null,
      amount: input.amount || null,
      requestedApproverAccountId: input.requestedApproverAccountId || null,
      requestedApproverEmployeeId: input.requestedApproverEmployeeId || null,
      attachmentFileIds: input.attachmentFileIds ?? [],
    },
  };
}

/**
 * The approver a new request is addressed to must be someone in the
 * submitter's own company who may decide it right now (Plan: access levels).
 * Without this an id from another company would be stored and sent the
 * submission notification — the employee's name and request subject — and a
 * request could be addressed to someone whose approval power the Owner has
 * switched off, where it would sit undecidable.
 *
 * Null when the choice is fine; the refusal otherwise.
 */
export async function checkRequestedApprover(
  actor: SessionActor,
  data: Pick<
    RequestWriteData,
    "requestedApproverAccountId" | "requestedApproverEmployeeId"
  >
): Promise<WriteFailure | null> {
  const overrideSelect = { permission: true, effect: true } as const;

  if (data.requestedApproverAccountId) {
    const account = await db.companyAccount.findFirst({
      where: scopedWhere(actor, { id: data.requestedApproverAccountId }),
      select: { role: true, permissionOverrides: { select: overrideSelect } },
    });
    const mayDecide =
      account &&
      has(
        {
          accountType: "company",
          role: account.role,
          ...splitOverrides(account.permissionOverrides),
        },
        "DecideRequests"
      );
    if (!mayDecide) {
      return invalidReference(
        "requestedApproverAccountId",
        "Choose someone from the list who can approve requests."
      );
    }
  }

  if (data.requestedApproverEmployeeId) {
    const employee =
      data.requestedApproverEmployeeId === actor.id
        ? null
        : await db.employee.findFirst({
            where: scopedWhere(actor, {
              id: data.requestedApproverEmployeeId,
              status: { not: "Suspended" as const },
            }),
            select: { permissionGrants: { select: overrideSelect } },
          });
    const mayDecide =
      employee &&
      has(
        {
          accountType: "employee",
          role: "Employee",
          ...splitOverrides(employee.permissionGrants),
        },
        "DecideRequests"
      );
    if (!mayDecide) {
      return invalidReference(
        "requestedApproverEmployeeId",
        "Choose someone from the list who can approve requests."
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The employee fields `canDecideOnRequest` needs, plus what the UI shows. */
export type RequestEmployee = {
  id: string;
  fullName: string;
  managerId: string | null;
  managerAccountId: string | null;
};

export type LoadedRequest = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  subject: string;
  description: string;
  startDate: Date | null;
  endDate: Date | null;
  dayPart: LeaveDayPart | null;
  amount: unknown;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  employee: RequestEmployee;
  approver: { id: string; fullName: string } | null;
  /** Set instead of `approver` when a grant-holding Employee decided this (Phase 11). */
  approverEmployee: { id: string; fullName: string } | null;
  /** Phase 21: who this request was addressed to (the person who can decide it). */
  requestedApprover: { id: string; fullName: string } | null;
  requestedApproverEmployee: { id: string; fullName: string } | null;
  requestedApproverAccountId: string | null;
  requestedApproverEmployeeId: string | null;
};

/** Shared by `findRequest`, the queues, and the detail pages (which add attachments). */
export const requestSelect = {
  id: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  startDate: true,
  endDate: true,
  dayPart: true,
  amount: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  requestedApproverAccountId: true,
  requestedApproverEmployeeId: true,
  employee: {
    select: {
      id: true,
      fullName: true,
      managerId: true,
      managerAccountId: true,
    },
  },
  approver: { select: { id: true, fullName: true } },
  approverEmployee: { select: { id: true, fullName: true } },
  requestedApprover: { select: { id: true, fullName: true } },
  requestedApproverEmployee: { select: { id: true, fullName: true } },
} as const;

/**
 * A request loaded for a write or a detail view, with everything the
 * authorisation rules need.
 *
 * Read through the tenant filter, so a request in another company reads as
 * "not found" rather than revealing it exists (Rules.md section 2). Callers
 * turn a `null` into their own 404 — HTTP responses stay in the routes.
 */
export function findRequest(
  actor: SessionActor,
  id: string
): Promise<LoadedRequest | null> {
  return db.request.findFirst({
    where: scopedWhere(actor, { id }),
    select: requestSelect,
  });
}

export type LoadedRequestPage = { requests: LoadedRequest[] } & PaginationMeta;

/**
 * An employee's own requests, newest first.
 *
 * Takes the raw requested page number rather than a pre-computed skip/take,
 * so the count this needs anyway (to know how many pages exist) is the same
 * count `paginationMeta` clamps against — one query, not two.
 */
export async function loadOwnRequests(
  actor: SessionActor,
  requestedPage: number
): Promise<LoadedRequestPage> {
  const where = scopedWhere(actor, { employeeId: actor.id });
  const total = await db.request.count({ where });
  const meta = paginationMeta(total, requestedPage);

  const requests = await db.request.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: requestSelect,
    skip: meta.skip,
    take: meta.take,
  });

  return { requests, ...meta };
}

/**
 * The approval queue: everything Owner/Admin/HR may decide on is every
 * request in the company; a Manager's is narrowed to their own direct
 * reports' (the same split `canDecideOnRequest` enforces per row, applied here
 * as a query filter so a Manager's queue never even lists somebody else's
 * report).
 */
export async function loadRequestsForApprover(
  actor: SessionActor,
  filters: RequestFilters,
  requestedPage: number
): Promise<LoadedRequestPage> {
  const where = requestFilter(filters);

  if (actor.role === "Manager") {
    where.employee = { managerAccountId: actor.id };
  }

  const scoped = scopedWhere(actor, where);
  const total = await db.request.count({ where: scoped });
  const meta = paginationMeta(total, requestedPage);

  const requests = await db.request.findMany({
    where: scoped,
    orderBy: { createdAt: "desc" },
    select: requestSelect,
    skip: meta.skip,
    take: meta.take,
  });

  return { requests, ...meta };
}
