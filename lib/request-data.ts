import type { WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { paginationMeta, type PaginationMeta } from "@/lib/pagination";
import { requestFilter, type RequestFilters } from "@/lib/requests";
import type { RequestStatus, RequestType } from "@/lib/generated/prisma/enums";
import type { CreateRequestInput } from "@/lib/validations/requests";

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
  amount: string | null;
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

  return {
    ok: true,
    data: {
      type: input.type,
      subject: input.subject,
      description: input.description,
      startDate: dateOrNull(input.startDate ?? ""),
      endDate: dateOrNull(input.endDate ?? ""),
      amount: input.amount || null,
    },
  };
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
  amount: unknown;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  employee: RequestEmployee;
  approver: { id: string; fullName: string } | null;
  /** Set instead of `approver` when a grant-holding Employee decided this (Phase 11). */
  approverEmployee: { id: string; fullName: string } | null;
};

const requestSelect = {
  id: true,
  type: true,
  status: true,
  subject: true,
  description: true,
  startDate: true,
  endDate: true,
  amount: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
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
