import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { WriteFailure } from "@/lib/api";
import {
  has,
  type AccountHolder,
  type GrantedPermission,
  type PowerHolder,
  type SessionActor,
} from "@/lib/permissions";
import {
  canHoldPower,
  LEVEL_DEFAULTS,
  splitOverrides,
  type Level,
} from "@/lib/permission-grants";
import type {
  CompanyRole,
  PermissionChangeKind,
} from "@/lib/generated/prisma/enums";

/**
 * Database access for the Owner's Authority page (Plan: access levels, grown
 * from Phase 11's employee grants). Callers must check
 * `canManagePermissionGrants` themselves — mirrors every other `-data.ts`
 * module, which trusts its caller the same way (Rules.md section 3: the check
 * is the route/page's job, not this module's).
 *
 * Every write here also appends a `PermissionChange` in the same transaction,
 * so the history can never disagree with what actually changed.
 */

/** Whose access is being read or changed: an Employee or a company login. */
export type PowerSubject = { kind: "employee" | "account"; id: string };

export type AuthorityPerson = {
  kind: PowerSubject["kind"];
  id: string;
  fullName: string;
  /** Employee code and job title, or a company login's work email. */
  detail: string;
  level: Level;
  grants: GrantedPermission[];
  revokes: GrantedPermission[];
};

const overrideSelect = { permission: true, effect: true } as const;

/** The FK columns that point a grant or a history row at `subject`. */
function subjectColumns(subject: PowerSubject) {
  return subject.kind === "employee"
    ? { employeeId: subject.id }
    : { accountId: subject.id };
}

/** Everyone in the company with their level and overrides — logins first. */
export async function loadAuthorityPeople(
  actor: SessionActor
): Promise<AuthorityPerson[]> {
  const [accounts, employees] = await Promise.all([
    db.companyAccount.findMany({
      where: scopedWhere(actor, {}),
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        workEmail: true,
        role: true,
        permissionOverrides: { select: overrideSelect },
      },
    }),
    db.employee.findMany({
      where: scopedWhere(actor, {}),
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        jobRole: true,
        permissionGrants: { select: overrideSelect },
      },
    }),
  ]);

  return [
    ...accounts.map((account) => ({
      kind: "account" as const,
      id: account.id,
      fullName: account.fullName,
      detail: account.workEmail,
      level: account.role,
      ...splitOverrides(account.permissionOverrides),
    })),
    ...employees.map((employee) => ({
      kind: "employee" as const,
      id: employee.id,
      fullName: employee.fullName,
      detail: [employee.employeeCode, employee.jobRole]
        .filter(Boolean)
        .join(" · "),
      level: "Employee" as const,
      ...splitOverrides(employee.permissionGrants),
    })),
  ];
}

/**
 * Every live company login in the company as a `PowerHolder` — for routing a
 * notification to "whoever may act on this" (a vault request, a legacy
 * approval), so switching someone's power off stops their alerts too.
 */
export async function loadAccountHolders(
  companyId: string
): Promise<AccountHolder[]> {
  const rows = await db.companyAccount.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true,
      role: true,
      permissionOverrides: { select: overrideSelect },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    accountType: "company" as const,
    ...splitOverrides(row.permissionOverrides),
  }));
}

/** `subject` as a `PowerHolder`, or null when it is not in this company. */
async function loadSubjectHolder(
  actor: SessionActor,
  subject: PowerSubject
): Promise<PowerHolder | null> {
  if (subject.kind === "employee") {
    const employee = await db.employee.findFirst({
      where: scopedWhere(actor, { id: subject.id }),
      select: { permissionGrants: { select: overrideSelect } },
    });
    return (
      employee && {
        accountType: "employee",
        role: "Employee",
        ...splitOverrides(employee.permissionGrants),
      }
    );
  }

  const account = await db.companyAccount.findFirst({
    where: scopedWhere(actor, { id: subject.id }),
    select: { role: true, permissionOverrides: { select: overrideSelect } },
  });
  return (
    account && {
      accountType: "company",
      role: account.role,
      ...splitOverrides(account.permissionOverrides),
    }
  );
}

const notFound: WriteFailure = {
  ok: false,
  status: 404,
  code: "not_found",
  message: "That person could not be found.",
};

const ownerLocked: WriteFailure = {
  ok: false,
  status: 400,
  code: "owner_locked",
  message: "The Owner always has every power — that can't be changed.",
};

/**
 * Switch one power on or off for one person.
 *
 * Stores the least it can: when the wanted state is what their level gives
 * anyway, the override row is removed rather than written, so a later level
 * change moves them onto the new level's defaults cleanly. Asking for the
 * state they already have is a no-op, and writes no history.
 */
export async function setPower(
  actor: SessionActor,
  subject: PowerSubject,
  permission: GrantedPermission,
  enabled: boolean
): Promise<{ ok: true } | WriteFailure> {
  const holder = await loadSubjectHolder(actor, subject);
  if (!holder) return notFound;
  if (holder.accountType === "company" && holder.role === "Owner") {
    return ownerLocked;
  }
  if (enabled && !canHoldPower(holder.accountType, permission)) {
    return {
      ok: false,
      status: 400,
      code: "needs_company_login",
      message:
        "An employee login can't hold this power — it needs a Manager or HR login.",
    };
  }
  if (has(holder, permission) === enabled) return { ok: true };

  const level: Level =
    holder.accountType === "employee" ? "Employee" : holder.role;
  const followsLevel = LEVEL_DEFAULTS[level].includes(permission) === enabled;
  const columns = subjectColumns(subject);
  const effect = enabled ? "Grant" : "Revoke";

  await db.$transaction([
    followsLevel
      ? db.permissionGrant.deleteMany({
          where: { companyId: actor.companyId, ...columns, permission },
        })
      : db.permissionGrant.upsert({
          where:
            subject.kind === "employee"
              ? {
                  companyId_employeeId_permission: {
                    companyId: actor.companyId,
                    employeeId: subject.id,
                    permission,
                  },
                }
              : {
                  companyId_accountId_permission: {
                    companyId: actor.companyId,
                    accountId: subject.id,
                    permission,
                  },
                },
          create: {
            companyId: actor.companyId,
            ...columns,
            permission,
            effect,
            grantedById: actor.id,
          },
          update: { effect, grantedById: actor.id },
        }),
    db.permissionChange.create({
      data: {
        companyId: actor.companyId,
        changedById: actor.id,
        ...columns,
        kind: enabled ? "PowerOn" : "PowerOff",
        permission,
      },
    }),
  ]);

  return { ok: true };
}

/** Remove every override — the person follows their level again. */
export async function resetPowers(
  actor: SessionActor,
  subject: PowerSubject
): Promise<{ ok: true } | WriteFailure> {
  const holder = await loadSubjectHolder(actor, subject);
  if (!holder) return notFound;
  if (holder.accountType === "company" && holder.role === "Owner") {
    return ownerLocked;
  }
  if (holder.grants.length === 0 && holder.revokes.length === 0) {
    return { ok: true };
  }

  const columns = subjectColumns(subject);
  await db.$transaction([
    db.permissionGrant.deleteMany({
      where: { companyId: actor.companyId, ...columns },
    }),
    db.permissionChange.create({
      data: {
        companyId: actor.companyId,
        changedById: actor.id,
        ...columns,
        kind: "Reset",
      },
    }),
  ]);

  return { ok: true };
}

/**
 * Move a company login to another level. Its overrides are cleared in the
 * same transaction: they were adjustments to the *old* level, and carrying a
 * "switched off payroll" from HR Team onto a new HR Head would silently
 * undercut the promotion.
 */
export async function changeLevel(
  actor: SessionActor,
  accountId: string,
  role: Exclude<CompanyRole, "Owner">
): Promise<{ ok: true } | WriteFailure> {
  const account = await db.companyAccount.findFirst({
    where: scopedWhere(actor, { id: accountId }),
    select: { id: true, role: true },
  });
  if (!account) return notFound;
  if (account.role === "Owner") return ownerLocked;
  if (account.role === role) return { ok: true };

  await db.$transaction([
    db.companyAccount.update({ where: { id: account.id }, data: { role } }),
    db.permissionGrant.deleteMany({
      where: { companyId: actor.companyId, accountId: account.id },
    }),
    db.permissionChange.create({
      data: {
        companyId: actor.companyId,
        changedById: actor.id,
        accountId: account.id,
        kind: "LevelChanged",
        fromRole: account.role,
        toRole: role,
      },
    }),
  ]);

  return { ok: true };
}

export type PowerChangeEntry = {
  id: string;
  kind: PermissionChangeKind;
  permission: GrantedPermission | null;
  fromRole: CompanyRole | null;
  toRole: CompanyRole | null;
  changedByName: string | null;
  createdAt: Date;
};

/** The latest changes to one person's access, newest first. */
export async function loadPowerHistory(
  actor: SessionActor,
  subject: PowerSubject
): Promise<PowerChangeEntry[]> {
  const rows = await db.permissionChange.findMany({
    where: { companyId: actor.companyId, ...subjectColumns(subject) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      kind: true,
      permission: true,
      fromRole: true,
      toRole: true,
      createdAt: true,
      changedBy: { select: { fullName: true } },
    },
  });

  return rows.map(({ changedBy, ...row }) => ({
    ...row,
    changedByName: changedBy?.fullName ?? null,
  }));
}
