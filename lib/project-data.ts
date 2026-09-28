import {
  duplicateFailure as duplicate,
  invalidReference as invalid,
  type WriteFailure,
} from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { canJoinTeam, TEAM_ELIGIBLE_STATUSES } from "@/lib/projects";
import type { SelectOption } from "@/components/forms/fields";
import type { ProjectStatus } from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS } from "@/lib/permission-grants";

/**
 * Database access for clients and projects.
 *
 * Holds the write resolution the mutating routes share and the option lists the
 * pages share, so the duplicate checks and the "does this id belong to my
 * company" checks exist in exactly one place.
 *
 * PATCH semantics match the employee routes: a key absent from the request is
 * left untouched, and an explicit empty string is what clears a value. Building
 * the column set unconditionally would mean a request naming three fields
 * silently wipes the rest.
 *
 * Every query here goes through `scopedWhere`, so a client, lead or employee id
 * belonging to another company simply will not be found (Rules.md section 2).
 */

const text = (value: string | undefined) => (value ? value : null);

/** Dates arrive as `YYYY-MM-DD` and are stored at UTC midnight. */
const dateOrNull = (value: string | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

/**
 * Money stays a string all the way into the Decimal column: converting through
 * a float first is what puts 149999.99999 in a database.
 */
const amountOrNull = (value: string | undefined) => (value ? value : null);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

type ClientInput = {
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
};

export type ClientWriteData = {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
};

export type ClientWriteResolution =
  { ok: true; data: ClientWriteData } | WriteFailure;

export async function resolveClientWrite(
  actor: SessionActor,
  input: ClientInput,
  options: { clientId?: string } = {}
): Promise<ClientWriteResolution> {
  /**
   * One record per customer, per company (the schema's [companyId, name]
   * unique). Checked here so the user gets a field-level message instead of a
   * constraint violation.
   */
  const clash = await db.client.findFirst({
    where: scopedWhere(actor, {
      name: input.name,
      ...(options.clientId ? { NOT: { id: options.clientId } } : {}),
    }),
    select: { id: true },
  });

  if (clash) {
    return duplicate("name", "You already have a client with that name.");
  }

  const data: ClientWriteData = { name: input.name };

  if (input.contactName !== undefined) {
    data.contactName = text(input.contactName);
  }
  if (input.contactEmail !== undefined) {
    data.contactEmail = text(input.contactEmail);
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = text(input.contactPhone);
  }
  if (input.notes !== undefined) data.notes = text(input.notes);

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

type ProjectInput = {
  name: string;
  clientId: string;
  code?: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: string;
  dueDate?: string;
  value?: string;
  estimatedCost?: string;
  lead?: string;
};

export type ProjectWriteData = {
  name: string;
  clientId: string;
  code?: string | null;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: Date | null;
  dueDate?: Date | null;
  value?: string | null;
  estimatedCost?: string | null;
  leadAccountId?: string | null;
};

export type ProjectWriteResolution =
  { ok: true; data: ProjectWriteData } | WriteFailure;

export async function resolveProjectWrite(
  actor: SessionActor,
  input: ProjectInput,
  options: { projectId?: string } = {}
): Promise<ProjectWriteResolution> {
  // --- The client must exist inside this company -------------------------
  const client = await db.client.findFirst({
    where: scopedWhere(actor, { id: input.clientId }),
    select: { id: true },
  });

  if (!client) {
    return invalid("clientId", "That client is not in your company.");
  }

  // --- Project code stays unique within the company ----------------------
  const code = input.code?.trim();

  if (code) {
    const clash = await db.project.findFirst({
      where: scopedWhere(actor, {
        code,
        ...(options.projectId ? { NOT: { id: options.projectId } } : {}),
      }),
      select: { id: true },
    });

    if (clash) {
      return duplicate("code", "Another project already uses that code.");
    }
  }

  // --- Dates must make sense ---------------------------------------------
  const startDate = dateOrNull(input.startDate);
  const dueDate = dateOrNull(input.dueDate);

  if (startDate && dueDate && dueDate < startDate) {
    return {
      ok: false,
      status: 400,
      code: "invalid_dates",
      field: "dueDate",
      message: "The due date cannot be before the start date.",
    };
  }

  const data: ProjectWriteData = { name: input.name, clientId: client.id };

  if (input.code !== undefined) data.code = code ? code : null;
  if (input.description !== undefined) {
    data.description = text(input.description);
  }
  if (input.status !== undefined) data.status = input.status;
  if (input.startDate !== undefined) data.startDate = startDate;
  if (input.dueDate !== undefined) data.dueDate = dueDate;
  if (input.value !== undefined) data.value = amountOrNull(input.value);
  if (input.estimatedCost !== undefined) {
    data.estimatedCost = amountOrNull(input.estimatedCost);
  }

  // --- Project lead -------------------------------------------------------
  if (input.lead !== undefined) {
    const leadId = input.lead.trim();

    if (!leadId) {
      data.leadAccountId = null;
    } else {
      const lead = await db.companyAccount.findFirst({
        where: scopedWhere(actor, { id: leadId }),
        select: { id: true },
      });

      if (!lead) {
        return invalid("lead", "That project lead is not in your company.");
      }

      data.leadAccountId = lead.id;
    }
  }

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Team membership
// ---------------------------------------------------------------------------

export type MemberResolution = { ok: true; employeeId: string } | WriteFailure;

/**
 * Check that an employee may be added to a project team.
 *
 * The project has already been loaded through the tenant filter by the caller;
 * this proves the *employee* is in the same company, and that they are someone
 * who can still be staffed.
 */
export async function resolveTeamMember(
  actor: SessionActor,
  projectId: string,
  employeeId: string
): Promise<MemberResolution> {
  const employee = await db.employee.findFirst({
    where: scopedWhere(actor, { id: employeeId }),
    select: { id: true, fullName: true, status: true },
  });

  if (!employee) {
    return invalid("employeeId", "That employee is not in your company.");
  }

  if (!canJoinTeam(employee.status)) {
    return {
      ok: false,
      status: 400,
      code: "employee_suspended",
      field: "employeeId",
      message: `${employee.fullName} is suspended and cannot be assigned to a project.`,
    };
  }

  const existing = await db.projectMember.findUnique({
    where: { projectId_employeeId: { projectId, employeeId: employee.id } },
    select: { id: true },
  });

  if (existing) {
    return duplicate("employeeId", "They are already on this team.");
  }

  return { ok: true, employeeId: employee.id };
}

// ---------------------------------------------------------------------------
// Reads shared by the project pages
// ---------------------------------------------------------------------------

/** Clients for the project form's picker and the list filter. */
export function loadClients(actor: SessionActor) {
  return db.client.findMany({
    where: scopedWhere(actor),
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: { id: true, name: true, status: true },
  });
}

/**
 * Company accounts that can lead a project.
 *
 * HR is offered too: they are a company account, and naming somebody
 * accountable for a piece of work is not the same as granting them the
 * Projects section.
 */
export async function loadLeadOptions(
  actor: SessionActor
): Promise<SelectOption[]> {
  const accounts = await db.companyAccount.findMany({
    where: scopedWhere(actor),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });

  return accounts.map((account) => ({
    value: account.id,
    label: `${account.fullName} (${LEVEL_LABELS[account.role]})`,
  }));
}

/**
 * Employees who can still be added to this project's team: in the company, not
 * suspended, and not already on it.
 */
export async function loadTeamCandidates(
  actor: SessionActor,
  projectId: string
): Promise<SelectOption[]> {
  const employees = await db.employee.findMany({
    where: scopedWhere(actor, {
      status: { in: [...TEAM_ELIGIBLE_STATUSES] },
      NOT: { projectMemberships: { some: { projectId } } },
    }),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, jobRole: true },
  });

  return employees.map((employee) => ({
    value: employee.id,
    label: employee.jobRole
      ? `${employee.fullName} — ${employee.jobRole}`
      : employee.fullName,
  }));
}

/**
 * The company's currency (PRD.md section 11 — INR by default, configurable per
 * company). Every amount is displayed in it, so pages that show money read it
 * rather than assuming.
 */
export async function loadCurrency(actor: SessionActor): Promise<string> {
  const company = await db.company.findFirst({
    where: { id: actor.companyId, deletedAt: null },
    select: { currency: true },
  });

  return company?.currency ?? "INR";
}
