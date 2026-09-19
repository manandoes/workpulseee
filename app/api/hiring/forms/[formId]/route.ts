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
import { canManageRecruitment } from "@/lib/permissions";
import {
  deleteHiringForm,
  loadApplicants,
  loadHiringForm,
  setFormStatus,
  updateHiringForm,
} from "@/lib/recruitment-data";
import {
  formStatusSchema,
  hiringFormSchema,
} from "@/lib/validations/recruitment";

const DENIED = "Only owners, admins and anyone granted hiring can do that.";

/** GET /api/hiring/forms/[formId] — one form, its questions and its applicants. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  const { formId } = await context.params;

  try {
    const form = await loadHiringForm(actor, formId);
    if (!form) return apiError("That form does not exist.", 404, "not_found");

    const applicants = await loadApplicants(actor, formId);
    return NextResponse.json({ form, applicants });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/hiring/forms/[formId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** PUT /api/hiring/forms/[formId] — replace the form's details and questions. */
export async function PUT(
  request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  const { formId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = hiringFormSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await updateHiringForm(actor, formId, parsed.data);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ formId: result.formId });
  } catch (cause) {
    return serverError(
      {
        route: "PUT /api/hiring/forms/[formId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * PATCH /api/hiring/forms/[formId] — open or close the form.
 *
 * Separate from PUT because it is a different decision with a different
 * audience: PUT edits what the company wrote, PATCH changes whether the
 * public can answer it.
 */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  const { formId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = formStatusSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await setFormStatus(actor, formId, parsed.data.status);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ status: parsed.data.status });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/hiring/forms/[formId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** DELETE /api/hiring/forms/[formId] — soft-delete, applicants included. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  const { formId } = await context.params;

  try {
    const result = await deleteHiringForm(actor, formId);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/hiring/forms/[formId]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
