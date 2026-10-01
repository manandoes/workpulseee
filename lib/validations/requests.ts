import { z } from "zod";
import {
  LEAVE_DAY_PARTS,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  requestNeedsAmount,
  requestNeedsDateRange,
  requestNeedsDayPart,
} from "@/lib/requests";

/**
 * Validation for requests (Rules.md section 4 — every request body is
 * validated before anything touches the database).
 *
 * Mirrors `lib/validations/tasks.ts`; the attachment schema there is reused
 * as-is (Rules.md section 1 — don't add a package or duplicate logic the
 * existing stack already solves) since a link is a link regardless of what it
 * is attached to.
 */
export {
  attachmentSchema,
  fileAttachmentSchema,
  type AttachmentInput,
} from "@/lib/validations/tasks";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

/**
 * The date range and amount are only required for the types that need them
 * (`requestNeedsDateRange`/`requestNeedsAmount`), enforced here with a
 * cross-field refinement so the API rejects a mismatched submission before it
 * ever reaches `lib/request-data.ts`.
 *
 * A request is addressed to a specific person (Phase 21): the employee
 * chooses who to submit it to. The `requestedApproverAccountId` or
 * `requestedApproverEmployeeId` is required and validated here — the
 * approver must exist in the same company and have approval authority.
 */
export const createRequestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    subject: z.string().trim().min(3, "Give the request a subject").max(160),
    description: z.string().trim().min(1, "Describe the request").max(4000),
    startDate: dateOnly.optional().or(z.literal("")),
    endDate: dateOnly.optional().or(z.literal("")),
    dayPart: z.enum(LEAVE_DAY_PARTS).optional(),
    amount: z
      .string()
      .trim()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount, for example 1500")
      .optional()
      .or(z.literal("")),
    /** Files already uploaded through `/api/files`, attached as the request is created. */
    attachmentFileIds: z
      .array(z.string().trim().min(1).max(40))
      .max(10, "Attach at most 10 files")
      .optional(),
    /** The company account (Owner/Admin/Manager/HR) this request is addressed to. */
    requestedApproverAccountId: z.string().trim().optional().or(z.literal("")),
    /** The employee (with a DecideRequests grant) this request is addressed to. */
    requestedApproverEmployeeId: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (requestNeedsDateRange(value.type)) {
      if (!value.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "Start date is required for this request type.",
        });
      }
      if (!value.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End date is required for this request type.",
        });
      }
      if (value.startDate && value.endDate && value.endDate < value.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End date cannot be before the start date.",
        });
      }
    }

    if (requestNeedsAmount(value.type) && !value.amount) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Amount is required for a reimbursement.",
      });
    }

    const dayPart = value.dayPart ?? "FullDay";
    if (
      requestNeedsDayPart(value.type) &&
      dayPart !== "FullDay" &&
      value.startDate &&
      value.endDate &&
      value.startDate !== value.endDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A half day must be a single day.",
      });
    }

    // Phase 21: exactly one approver must be provided (company account OR employee)
    const hasAccountApprover = Boolean(value.requestedApproverAccountId);
    const hasEmployeeApprover = Boolean(value.requestedApproverEmployeeId);
    if (!hasAccountApprover && !hasEmployeeApprover) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedApproverAccountId"],
        message: "Choose who this request is submitted to.",
      });
    }
    if (hasAccountApprover && hasEmployeeApprover) {
      ctx.addIssue({
        code: "custom",
        path: ["requestedApproverAccountId"],
        message: "Choose one approver, not both.",
      });
    }
  });

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/**
 * A decision is one-time (`lib/request-data.ts` refuses to re-decide an
 * already-`Pending`-only request), so this only ever moves a request out of
 * `Pending` — never back to it.
 */
export const decisionSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  decisionNote: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type DecisionInput = z.infer<typeof decisionSchema>;

/** List filters. Unknown values are dropped, mirroring `taskFiltersSchema`. */
export const requestFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(REQUEST_STATUSES).optional().catch(undefined),
  type: z.enum(REQUEST_TYPES).optional().catch(undefined),
  employeeId: z.string().trim().max(40).optional().catch(undefined),
});

export type RequestFiltersInput = z.infer<typeof requestFiltersSchema>;
