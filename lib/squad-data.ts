import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";

/**
 * Database access for the Squad page (Phase 11) — every company account and
 * every employee, flat rather than `lib/employees.ts`'s `buildOrgTree`
 * (which shapes the same two sources into a reporting hierarchy for the org
 * chart; Squad is a directory of people, not a tree).
 */

export type SquadMember = {
  kind: "employee" | "account";
  id: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string;
  employeeCode: string | null;
};

export async function loadSquadMembers(
  actor: SessionActor
): Promise<SquadMember[]> {
  const [accounts, employees] = await Promise.all([
    db.companyAccount.findMany({
      where: { companyId: actor.companyId, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, avatarUrl: true, role: true },
    }),
    db.employee.findMany({
      where: scopedWhere(actor, {}),
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        jobRole: true,
        employeeCode: true,
      },
    }),
  ]);

  const accountMembers: SquadMember[] = accounts.map((account) => ({
    kind: "account",
    id: account.id,
    name: account.fullName,
    avatarUrl: account.avatarUrl,
    subtitle: account.role,
    employeeCode: null,
  }));

  const employeeMembers: SquadMember[] = employees.map((employee) => ({
    kind: "employee",
    id: employee.id,
    name: employee.fullName,
    avatarUrl: employee.avatarUrl,
    subtitle: employee.jobRole ?? "No role set",
    employeeCode: employee.employeeCode,
  }));

  return [...accountMembers, ...employeeMembers];
}
