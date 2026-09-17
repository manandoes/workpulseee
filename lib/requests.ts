import type {
  LeaveDayPart,
  RequestStatus,
  RequestType,
} from "@/lib/generated/prisma/enums";

/**
 * Request business logic (Rules.md section 5 — rules live in `lib/`, not
 * inside route handlers or components).
 *
 * Pure and free of Prisma/NextAuth imports, like `lib/tasks.ts`, so the rules
 * about which fields a request type needs can be unit-tested directly.
 */

/**
 * The eight request types PRD.md section 6.6 lists. One shared shape rather
 * than eight tables (Architecture.md section 6's "polymorphic Request model"
 * decision) — `requestNeedsDateRange`/`requestNeedsAmount` are what let the
 * form and the write resolver agree on which fields a given type actually
 * needs.
 */
export const REQUEST_TYPES = [
  "Leave",
  "Reimbursement",
  "Equipment",
  "WFH",
  "HR",
  "Complaint",
  "Document",
  "Suggestion",
] as const;

export const REQUEST_STATUSES = ["Pending", "Approved", "Rejected"] as const;

/** Leave and work-from-home are the two types with a date range. */
export function requestNeedsDateRange(type: RequestType): boolean {
  return type === "Leave" || type === "WFH";
}

/** Only a reimbursement carries an amount. */
export function requestNeedsAmount(type: RequestType): boolean {
  return type === "Reimbursement";
}

/**
 * Only a Leave request may name which part of the day it covers. Widening
 * this to `WFH` later is one `||`, per Plan.md Phase 16's open decision.
 */
export function requestNeedsDayPart(type: RequestType): boolean {
  return type === "Leave";
}

export const LEAVE_DAY_PARTS = [
  "FullDay",
  "FirstHalf",
  "SecondHalf",
] as const satisfies readonly LeaveDayPart[];

const DAY_PART_LABELS: Record<LeaveDayPart, string> = {
  FullDay: "Full day",
  FirstHalf: "First half",
  SecondHalf: "Second half",
};

export function dayPartLabel(dayPart: LeaveDayPart): string {
  return DAY_PART_LABELS[dayPart];
}

const TYPE_LABELS: Record<RequestType, string> = {
  Leave: "Leave",
  Reimbursement: "Reimbursement",
  Equipment: "Equipment",
  WFH: "Work from home",
  HR: "HR request",
  Complaint: "Complaint",
  Document: "Document request",
  Suggestion: "Suggestion",
};

export function requestTypeLabel(type: RequestType): string {
  return TYPE_LABELS[type];
}

/**
 * The type label, with a half-day leave's part called out ("Leave · First
 * half") — shared by the list and detail views so they can never disagree.
 * A `FullDay` (or absent, on every non-Leave type) shows just the type.
 */
export function requestTypeDisplay(
  type: RequestType,
  dayPart: LeaveDayPart | null
): string {
  if (!dayPart || dayPart === "FullDay") return requestTypeLabel(type);
  return `${requestTypeLabel(type)} · ${dayPartLabel(dayPart)}`;
}

const STATUS_LABELS: Record<RequestStatus, string> = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
};

export function requestStatusLabel(status: RequestStatus): string {
  return STATUS_LABELS[status];
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export type RequestFilters = {
  q?: string;
  status?: RequestStatus;
  type?: RequestType;
  employeeId?: string;
};

/**
 * Build the `where` fragment for a request list, mirroring `taskFilter` in
 * `lib/tasks.ts`. The caller wraps this in `scopedWhere()` (and, for a
 * Manager, the direct-reports filter) so the tenant boundary is always applied
 * last and can never be widened by a filter (Rules.md section 2).
 */
export function requestFilter(filters: RequestFilters) {
  const where: Record<string, unknown> = {};

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { employee: { fullName: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.employeeId) where.employeeId = filters.employeeId;

  return where;
}

/** Newest first — an approval queue is worked from what just arrived. */
export const REQUEST_ORDER = [{ createdAt: "desc" }] as const;
