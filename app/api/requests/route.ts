import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  findRequest,
  loadOwnRequests,
  loadRequestsForApprover,
  resolveAttachmentFiles,
  resolveRequest,
  checkRequestedApprover,
} from "@/lib/request-data";
import { notifyRequestSubmitted } from "@/lib/notification-data";
import { canApproveRequests } from "@/lib/permissions";
import { paginationSchema } from "@/lib/pagination";
import {
  createRequestSchema,
  requestFiltersSchema,
} from "@/lib/validations/requests";

/**
 * GET /api/requests — an employee's own requests, or the approval queue.
 *
 * The same route serves both sides (Phases.md Phase 7's "My Requests" and
 * "Requests"), the way `GET /api/tasks` serves board and list — the caller's
 * account type decides which read runs, so the two views can never disagree
 * about what a role is allowed to see.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const { page: requestedPage } = paginationSchema.parse(params);

    if (actor.accountType === "employee") {
      const { requests, total, page, pageCount } = await loadOwnRequests(
        actor,
        requestedPage
      );
      return NextResponse.json({ requests, total, page, pageCount });
    }

    if (!canApproveRequests(actor)) return forbidden();

    const filters = requestFiltersSchema.parse(params);
    const { requests, total, page, pageCount } = await loadRequestsForApprover(
      actor,
      filters,
      requestedPage
    );
    return NextResponse.json({ requests, total, page, pageCount });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/requests",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/requests — submit a request (Phases.md Phase 7).
 *
 * Employee-only: a CompanyAccount decides on requests but never submits one
 * (Architecture.md section 4's employee/company-account split).
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (actor.accountType !== "employee") {
    return forbidden("Only employees submit requests.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = createRequestSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const resolved = resolveRequest(parsed.data);
  if (!resolved.ok) return writeFailure(resolved);

  // Reference documents uploaded with the form, attached in the same write
  // so a request never exists without the files it was allotted with.
  const files = await resolveAttachmentFiles(
    actor,
    parsed.data.attachmentFileIds ?? []
  );
  if (!files.ok) return writeFailure(files);

  try {
    const approverFailure = await checkRequestedApprover(actor, resolved.data);
    if (approverFailure) return writeFailure(approverFailure);

    const { attachmentFileIds: _attachmentFileIds, ...requestData } = resolved.data;
    const created = await db.request.create({
      data: {
        ...requestData,
        companyId: actor.companyId,
        employeeId: actor.id,
        attachments: {
          create: files.files.map((file) => ({
            companyId: actor.companyId,
            fileId: file.id,
            label: file.name,
            addedByEmployeeId: actor.id,
          })),
        },
      },
      select: { id: true, type: true, status: true, subject: true },
    });

    const loaded = await findRequest(actor, created.id);
    if (loaded) {
      // Best-effort: a failed notification must never fail the submission.
      await notifyRequestSubmitted({
        id: loaded.id,
        companyId: actor.companyId,
        type: loaded.type,
        subject: loaded.subject,
        employee: loaded.employee,
        requestedApproverAccountId: loaded.requestedApproverAccountId,
        requestedApproverEmployeeId: loaded.requestedApproverEmployeeId,
      });
    }

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/requests",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
