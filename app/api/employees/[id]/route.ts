import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { scopedWhere } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveEmployeeWrite } from "@/lib/employee-data";
import {
  canEditEmployee,
  canManageEmployees,
  canViewPersonalDetails,
} from "@/lib/permissions";
import { updateEmployeeSchema } from "@/lib/validations/employees";

/**
 * PATCH /api/employees/[id] — edit an employee profile.
 *
 * Phases.md Phase 3: "add, view, edit and list employees with correct
 * role-based visibility". Owner/Admin/HR may edit anyone in their company; a
 * Manager may edit only their own direct reports (PRD.md section 9).
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext<"/api/employees/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = updateEmployeeSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    /**
     * Loaded through the tenant filter, so an id from another company reads as
     * "not found" rather than leaking that the record exists at all
     * (Rules.md section 2).
     */
    const employee = await db.employee.findFirst({
      where: scopedWhere(actor, { id }),
      select: { id: true, managerId: true, managerAccountId: true },
    });

    if (!employee) return apiError("Employee not found.", 404, "not_found");

    if (!canEditEmployee(actor, employee)) {
      return forbidden("You can only edit your own direct reports.");
    }

    const resolved = await resolveEmployeeWrite(actor, parsed.data, {
      employeeId: employee.id,
      includePersonal: canViewPersonalDetails(actor, employee),
    });

    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: resolved.message,
          code: resolved.code,
          ...(resolved.field
            ? { fieldErrors: { [resolved.field]: resolved.message } }
            : {}),
        },
        { status: resolved.status }
      );
    }

    const updated = await db.employee.update({
      where: { id: employee.id },
      data: resolved.data,
      select: { id: true, fullName: true },
    });

    return NextResponse.json({ employee: updated });
  } catch (cause) {
    return serverError(
      {
        route: "PATCH /api/employees/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * DELETE /api/employees/[id] — remove an employee from the directory.
 *
 * Rules.md section 6: never hard-delete a record referenced by tasks,
 * requests and performance history — this sets `deletedAt` instead, exactly
 * like the status route's suspend/reactivate. `scopedWhere` already excludes
 * `deletedAt` rows from every company-scoped query, so the employee
 * disappears from the directory, org chart and every list immediately while
 * their history stays intact.
 *
 * Gated by `canManageEmployees` rather than `canEditEmployee`: removing
 * someone from the directory is a directory-management action like
 * suspension, not a profile edit a Manager should be able to do to their own
 * reports.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/employees/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageEmployees(actor)) {
    return forbidden("Only owners, admins and HR can remove an employee.");
  }

  const { id } = await context.params;

  try {
    const employee = await db.employee.findFirst({
      where: scopedWhere(actor, { id }),
      select: { id: true },
    });

    if (!employee) return apiError("Employee not found.", 404, "not_found");

    await db.employee.update({
      where: { id: employee.id },
      data: { deletedAt: new Date() },
    });

    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/employees/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
