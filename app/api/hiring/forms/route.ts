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
import { createHiringForm, loadHiringForms } from "@/lib/recruitment-data";
import { hiringFormSchema } from "@/lib/validations/recruitment";

const DENIED = "Only owners, admins and anyone granted hiring can do that.";

/** GET /api/hiring/forms — every recruitment form in the company. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  try {
    const forms = await loadHiringForms(actor);
    return NextResponse.json({ forms });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/hiring/forms",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/hiring/forms — create a form, always as a draft.
 *
 * Publishing is a separate, deliberate action: a form becomes reachable by
 * strangers, and that should never be a side effect of pressing Save.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) return forbidden(DENIED);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = hiringFormSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await createHiringForm(actor, parsed.data);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ formId: result.formId }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/hiring/forms",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
