import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import {
  formatManagerRef,
  managerFields,
  parseManagerRef,
  wouldCreateCycle,
} from "@/lib/employees";
import type { SelectGroup } from "@/components/forms/fields";
import type { EmploymentType } from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS } from "@/lib/permission-grants";

/**
 * Database access for employee management.
 *
 * Holds the reads the pages share (departments, manager options) and the write
 * resolution the two mutating routes share, so the duplicate checks, department
 * lookup and reporting-line rules exist in exactly one place.
 *
 * PATCH semantics are real here: a key that is absent from the request is left
 * untouched, and only an explicit empty string clears a value. Building the
 * column set unconditionally would mean a request that mentions three fields
 * silently wipes the other twelve — the edit form always submits every field,
 * so nothing would look wrong until something else called the API.
 *
 * Shared by `POST /api/employees` and `PATCH /api/employees/[id]` so that the
 * duplicate checks, the department lookup and the reporting-line rules are
 * written once and cannot drift apart between creating and editing.
 *
 * Every query here goes through `scopedWhere`, so a department or manager id
 * belonging to another company simply will not be found (Rules.md section 2).
 */

type ProfileInput = {
  fullName: string;
  companyEmail: string;
  employeeCode: string;
  departmentName?: string;
  jobRole?: string;
  employmentType?: string;
  startDate?: string;
  manager?: string;
  personalEmail?: string;
  phone?: string;
  dateOfBirth?: string;
  location?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
};

/**
 * The scalar columns a create or update writes.
 *
 * Every optional column is genuinely optional here, because an absent key means
 * "leave this alone" — see the note on `resolveEmployeeWrite`.
 */
export type EmployeeWriteData = {
  fullName: string;
  companyEmail: string;
  employeeCode: string;
  departmentId?: string | null;
  jobRole?: string | null;
  employmentType?: EmploymentType | null;
  startDate?: Date | null;
  managerId?: string | null;
  managerAccountId?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  dateOfBirth?: Date | null;
  location?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

export type WriteResolution =
  | { ok: true; data: EmployeeWriteData }
  | {
      ok: false;
      message: string;
      status: number;
      code: string;
      field?: string;
    };

const text = (value: string | undefined) => (value ? value : null);

/** Dates arrive as `YYYY-MM-DD` and are stored at UTC midnight. */
const dateOrNull = (value: string | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

export async function resolveEmployeeWrite(
  actor: SessionActor,
  input: ProfileInput,
  options: { employeeId?: string; includePersonal: boolean }
): Promise<WriteResolution> {
  const { employeeId, includePersonal } = options;

  // --- Identity must stay unique within the company ---------------------
  const clash = await db.employee.findFirst({
    where: scopedWhere(actor, {
      OR: [
        { companyEmail: input.companyEmail },
        { employeeCode: input.employeeCode },
      ],
      // When editing, the employee's own row is obviously not a clash.
      ...(employeeId ? { NOT: { id: employeeId } } : {}),
    }),
    select: { companyEmail: true },
  });

  if (clash) {
    const sameEmail = clash.companyEmail === input.companyEmail;
    return {
      ok: false,
      status: 409,
      code: "duplicate_employee",
      field: sameEmail ? "companyEmail" : "employeeCode",
      message: sameEmail
        ? "An employee with that email already exists."
        : "An employee with that employee ID already exists.",
    };
  }

  const data: EmployeeWriteData = {
    fullName: input.fullName,
    companyEmail: input.companyEmail,
    employeeCode: input.employeeCode,
  };

  // --- Department: find inside this company, or create it ---------------
  if (input.departmentName !== undefined) {
    const departmentName = input.departmentName.trim();

    if (!departmentName) {
      data.departmentId = null;
    } else {
      const existing = await db.department.findFirst({
        where: scopedWhere(actor, { name: departmentName }),
        select: { id: true },
      });

      data.departmentId =
        existing?.id ??
        (
          await db.department.create({
            data: { companyId: actor.companyId, name: departmentName },
            select: { id: true },
          })
        ).id;
    }
  }

  // --- Reporting line ---------------------------------------------------
  const managerRef = parseManagerRef(input.manager);

  if (input.manager !== undefined) {
    Object.assign(data, managerFields(managerRef));
  }

  if (managerRef?.kind === "employee") {
    if (managerRef.id === employeeId) {
      return {
        ok: false,
        status: 400,
        code: "invalid_manager",
        field: "manager",
        message: "An employee cannot report to themselves.",
      };
    }

    const exists = await db.employee.findFirst({
      where: scopedWhere(actor, { id: managerRef.id }),
      select: { id: true },
    });
    if (!exists) {
      return {
        ok: false,
        status: 400,
        code: "invalid_manager",
        field: "manager",
        message: "That manager is not in your company.",
      };
    }

    if (employeeId) {
      // Only an existing employee can be moved into a loop; a brand new one has
      // no reports yet.
      const lines = await db.employee.findMany({
        where: scopedWhere(actor),
        select: { id: true, managerId: true },
      });

      if (wouldCreateCycle(lines, employeeId, managerRef.id)) {
        return {
          ok: false,
          status: 400,
          code: "invalid_manager",
          field: "manager",
          message:
            "That would create a reporting loop — they already report to this employee.",
        };
      }
    }
  }

  if (managerRef?.kind === "account") {
    const exists = await db.companyAccount.findFirst({
      where: scopedWhere(actor, { id: managerRef.id }),
      select: { id: true },
    });
    if (!exists) {
      return {
        ok: false,
        status: 400,
        code: "invalid_manager",
        field: "manager",
        message: "That manager is not in your company.",
      };
    }
  }

  if (input.jobRole !== undefined) data.jobRole = text(input.jobRole);
  if (input.employmentType !== undefined) {
    data.employmentType = (input.employmentType ||
      null) as EmploymentType | null;
  }
  if (input.startDate !== undefined) {
    data.startDate = dateOrNull(input.startDate);
  }

  /**
   * Only the edit form collects personal details. Guarding the write means the
   * add-employee form cannot blank them out, and a caller who was never shown
   * these fields cannot overwrite them by hand-crafting a request.
   */
  if (includePersonal) {
    if (input.personalEmail !== undefined)
      data.personalEmail = text(input.personalEmail);
    if (input.phone !== undefined) data.phone = text(input.phone);
    if (input.dateOfBirth !== undefined)
      data.dateOfBirth = dateOrNull(input.dateOfBirth);
    if (input.location !== undefined) data.location = text(input.location);
    if (input.address !== undefined) data.address = text(input.address);
    if (input.emergencyContactName !== undefined)
      data.emergencyContactName = text(input.emergencyContactName);
    if (input.emergencyContactPhone !== undefined)
      data.emergencyContactPhone = text(input.emergencyContactPhone);
  }

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Reads shared by the employee pages
// ---------------------------------------------------------------------------

/** Departments in the caller's company, for filters and form suggestions. */
export function loadDepartments(actor: SessionActor) {
  return db.department.findMany({
    where: scopedWhere(actor),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Options for the "reports to" picker, grouped by which table they come from.
 *
 * Architecture.md section 4 allows a manager to be a CompanyAccount or another
 * Employee, so both are offered. The employee being edited is excluded — a
 * person cannot report to themselves.
 */
export async function loadManagerOptions(
  actor: SessionActor,
  excludeEmployeeId?: string
): Promise<SelectGroup[]> {
  const [accounts, employees] = await Promise.all([
    db.companyAccount.findMany({
      where: scopedWhere(actor),
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    }),
    db.employee.findMany({
      where: scopedWhere(actor, {
        ...(excludeEmployeeId ? { NOT: { id: excludeEmployeeId } } : {}),
      }),
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, jobRole: true },
    }),
  ]);

  const groups: SelectGroup[] = [];

  if (accounts.length > 0) {
    groups.push({
      label: "Company accounts",
      options: accounts.map((account) => ({
        value: formatManagerRef({ kind: "account", id: account.id }),
        label: `${account.fullName} (${LEVEL_LABELS[account.role]})`,
      })),
    });
  }

  if (employees.length > 0) {
    groups.push({
      label: "Employees",
      options: employees.map((employee) => ({
        value: formatManagerRef({ kind: "employee", id: employee.id }),
        label: employee.jobRole
          ? `${employee.fullName} — ${employee.jobRole}`
          : employee.fullName,
      })),
    });
  }

  return groups;
}
