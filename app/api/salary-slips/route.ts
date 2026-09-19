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
import { canManagePayroll } from "@/lib/permissions";
import { loadSlipsForPeriod, saveSlip } from "@/lib/payroll-data";
import { saveSlipSchema } from "@/lib/validations/payroll";

/** GET /api/salary-slips?year=&month= — every slip for one period (payroll only). */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePayroll(actor)) {
    return forbidden("Only owners, admins and HR can view payroll.");
  }

  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return apiError("Provide a year and month.", 400, "invalid_period");
  }

  try {
    const slips = await loadSlipsForPeriod(actor, year, month);
    return NextResponse.json({ slips });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/salary-slips",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** POST /api/salary-slips — create or replace one employee's slip for a period. */
export async function POST(request: Request) {
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

  const parsed = saveSlipSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await saveSlip(actor, parsed.data);
    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ slip: result.slip }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/salary-slips",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
