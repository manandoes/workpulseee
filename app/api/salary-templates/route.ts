import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManagePayroll } from "@/lib/permissions";
import { loadSalaryTemplate, saveSalaryTemplate } from "@/lib/payroll-data";
import { salaryTemplateSchema } from "@/lib/validations/payroll";

/**
 * The company's salary structure (Plan: salary slips) — the earning and
 * deduction lines every generated slip starts from.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePayroll(actor)) {
    return forbidden("Only owners, admins and HR can manage payroll.");
  }

  try {
    const components = await loadSalaryTemplate(actor.companyId);
    return NextResponse.json({ components });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/salary-templates",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

export async function PUT(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePayroll(actor)) {
    return forbidden("Only owners, admins and HR can manage payroll.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = salaryTemplateSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    await saveSalaryTemplate(actor.companyId, parsed.data.components);
    return NextResponse.json({ components: parsed.data.components });
  } catch (cause) {
    return serverError(
      {
        route: "PUT /api/salary-templates",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
