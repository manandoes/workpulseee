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
import { publishToGoogle } from "@/lib/google-forms-data";
import { loadHiringForm, setFormStatus } from "@/lib/recruitment-data";
import { publishFormSchema } from "@/lib/validations/recruitment";

const DENIED = "Only owners, admins and anyone granted hiring can do that.";

/**
 * POST /api/hiring/forms/[formId]/publish — take a form live.
 *
 * Both destinations end in the same state — a `Live` form — but by different
 * routes. `Hosted` is a status flip: the public page already knows how to
 * render it. `GoogleForm` has to create the real thing on the company's Google
 * account first, and only goes live if Google accepted it.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/hiring/forms/[formId]/publish">
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

  const parsed = publishFormSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const form = await loadHiringForm(actor, formId);
    if (!form) return apiError("That form does not exist.", 404, "not_found");

    // A form with no questions still collects name, email and phone, so it is
    // publishable — but a form nobody can answer is not. This is the one
    // pre-publish check worth making: everything else the builder validated.
    if (form.questions.length === 0 && parsed.data.destination === "Hosted") {
      return apiError(
        "Add at least one question before publishing.",
        400,
        "no_questions"
      );
    }

    if (parsed.data.destination === "GoogleForm") {
      const result = await publishToGoogle(actor, formId);
      if (!result.ok) return writeFailure(result);

      return NextResponse.json({
        destination: "GoogleForm",
        responderUrl: result.responderUrl,
        editUrl: result.editUrl,
        downgradedDocuments: result.downgradedDocuments,
      });
    }

    const result = await setFormStatus(actor, formId, "Live");
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ destination: "Hosted", slug: form.slug });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/hiring/forms/[formId]/publish",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
