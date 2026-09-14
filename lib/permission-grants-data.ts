import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { GrantedPermission, SessionActor } from "@/lib/permissions";

/**
 * Database access for permission grants (Phase 11). Callers must check
 * `canManagePermissionGrants` themselves — mirrors every other `-data.ts`
 * module, which trusts its caller the same way (Rules.md section 3: the
 * check is the route/page's job, not this module's).
 */

export type EmployeeGrantsRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  jobRole: string | null;
  grants: GrantedPermission[];
};

/** Every employee in the company, with their active grants — the admin table. */
export async function loadGrantsForCompany(
  actor: SessionActor
): Promise<EmployeeGrantsRow[]> {
  const employees = await db.employee.findMany({
    where: scopedWhere(actor, {}),
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      jobRole: true,
      permissionGrants: { select: { permission: true } },
    },
  });

  return employees.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    employeeCode: employee.employeeCode,
    jobRole: employee.jobRole,
    grants: employee.permissionGrants.map((grant) => grant.permission),
  }));
}

export type SetGrantResolution =
  { ok: true } | { ok: false; message: string; status: number };

/**
 * Grant or revoke one permission for one employee. The caller must already
 * be `canManagePermissionGrants` and `grantedById` must be their own id.
 */
export async function setGrant(
  actor: SessionActor,
  employeeId: string,
  permission: GrantedPermission,
  granted: boolean
): Promise<SetGrantResolution> {
  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id: employeeId }),
    select: { id: true },
  });
  if (!employee) {
    return {
      ok: false,
      message: "That employee could not be found.",
      status: 400,
    };
  }

  if (granted) {
    await db.permissionGrant.upsert({
      where: {
        companyId_employeeId_permission: {
          companyId: actor.companyId,
          employeeId,
          permission,
        },
      },
      create: {
        companyId: actor.companyId,
        employeeId,
        permission,
        grantedById: actor.id,
      },
      update: {},
    });
  } else {
    await db.permissionGrant.deleteMany({
      where: { companyId: actor.companyId, employeeId, permission },
    });
  }

  return { ok: true };
}
