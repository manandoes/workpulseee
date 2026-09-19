import { NextResponse } from "next/server";
import { forbidden, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManagePayroll } from "@/lib/permissions";
import { deleteSlip } from "@/lib/payroll-data";

/**
 * DELETE /api/salary-slips/[id] — remove a slip and any PDF uploaded for it.
 *
 * A real delete, unlike most records in this schema: a slip issued for the
 * wrong month has no history worth keeping, and a soft-deleted one would still
 * occupy the `(employeeId, year, month)` unique slot the correction needs.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/salary-slips/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManagePayroll(actor)) {
    return forbidden("Only owners, admins and HR can manage payroll.");
  }

  const { id } = await context.params;

  try {
    await deleteSlip(actor, id);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/salary-slips/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
