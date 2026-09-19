import { db } from "@/lib/db";
import { invalidReference, type WriteFailure } from "@/lib/api";
import type { SessionActor } from "@/lib/permissions";
import { canManagePayroll, canViewSalarySlip } from "@/lib/permissions";
import {
  DEFAULT_COMPONENTS,
  computeTotals,
  parseComponents,
  parseLines,
  type SalaryComponent,
  type SlipLine,
} from "@/lib/payroll";

/**
 * Database access for salary slips (Plan: salary slips).
 *
 * Totals are recomputed here from the submitted lines rather than trusted from
 * the request body — a client-supplied net pay is exactly the number nobody
 * should be able to set directly.
 */

export async function loadSalaryTemplate(
  companyId: string
): Promise<SalaryComponent[]> {
  const template = await db.salaryTemplate.findUnique({
    where: { companyId },
    select: { components: true },
  });

  if (!template) return DEFAULT_COMPONENTS;

  const parsed = parseComponents(template.components);
  return parsed.length > 0 ? parsed : DEFAULT_COMPONENTS;
}

export async function saveSalaryTemplate(
  companyId: string,
  components: SalaryComponent[]
) {
  await db.salaryTemplate.upsert({
    where: { companyId },
    create: { companyId, components },
    update: { components },
  });
}

export type LoadedSlip = {
  id: string;
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  lines: SlipLine[];
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  uploadedFileId: string | null;
  published: boolean;
};

const slipSelect = {
  id: true,
  employeeId: true,
  month: true,
  year: true,
  components: true,
  grossMinor: true,
  deductionMinor: true,
  netMinor: true,
  uploadedFileId: true,
  published: true,
  employee: { select: { fullName: true } },
} as const;

type SlipRow = {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  components: unknown;
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
  uploadedFileId: string | null;
  published: boolean;
  employee: { fullName: string };
};

function toLoadedSlip(row: SlipRow): LoadedSlip {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    month: row.month,
    year: row.year,
    lines: parseLines(row.components),
    grossMinor: row.grossMinor,
    deductionMinor: row.deductionMinor,
    netMinor: row.netMinor,
    uploadedFileId: row.uploadedFileId,
    published: row.published,
  };
}

/**
 * The signed-in employee's own published slips, newest first — what the
 * Settings card lists. Drafts are excluded: an unpublished slip is HR's
 * working copy, not something the employee should see a number from yet.
 */
export async function loadMySalarySlips(
  actor: SessionActor
): Promise<LoadedSlip[]> {
  if (actor.accountType !== "employee") return [];

  const rows = await db.salarySlip.findMany({
    where: {
      companyId: actor.companyId,
      employeeId: actor.id,
      published: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: slipSelect,
  });

  return rows.map(toLoadedSlip);
}

/** Every slip for one period — the payroll management table. */
export async function loadSlipsForPeriod(
  actor: SessionActor,
  year: number,
  month: number
): Promise<LoadedSlip[]> {
  const rows = await db.salarySlip.findMany({
    where: { companyId: actor.companyId, year, month },
    orderBy: { employee: { fullName: "asc" } },
    select: slipSelect,
  });

  return rows.map(toLoadedSlip);
}

/** One slip, if this actor may read it. Null covers both "no such slip" and "not yours". */
export async function loadSlip(
  actor: SessionActor,
  slipId: string
): Promise<LoadedSlip | null> {
  const row = await db.salarySlip.findFirst({
    where: { id: slipId, companyId: actor.companyId },
    select: slipSelect,
  });

  if (!row) return null;
  if (!canViewSalarySlip(actor, row)) return null;

  return toLoadedSlip(row);
}

export type SaveSlipResult = { ok: true; slip: LoadedSlip } | WriteFailure;

/**
 * Create or replace one employee's slip for a period.
 *
 * Upsert on `(employeeId, year, month)`: re-running a month corrects the
 * existing slip rather than producing a second one, which the unique
 * constraint would refuse anyway.
 */
export async function saveSlip(
  actor: SessionActor,
  input: {
    employeeId: string;
    year: number;
    month: number;
    lines: SlipLine[];
    uploadedFileId?: string | null;
    published: boolean;
  }
): Promise<SaveSlipResult> {
  const employee = await db.employee.findFirst({
    where: {
      id: input.employeeId,
      companyId: actor.companyId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!employee) {
    return invalidReference("employeeId", "That employee is not in this company.");
  }

  if (input.uploadedFileId) {
    const file = await db.storedFile.findFirst({
      where: { id: input.uploadedFileId, companyId: actor.companyId },
      select: { id: true },
    });
    if (!file) {
      return invalidReference("uploadedFileId", "That file is no longer available.");
    }
  }

  const totals = computeTotals(input.lines);

  const row = await db.salarySlip.upsert({
    where: {
      employeeId_year_month: {
        employeeId: input.employeeId,
        year: input.year,
        month: input.month,
      },
    },
    create: {
      companyId: actor.companyId,
      employeeId: input.employeeId,
      year: input.year,
      month: input.month,
      components: input.lines,
      ...totals,
      uploadedFileId: input.uploadedFileId ?? null,
      published: input.published,
      createdById: actor.accountType === "company" ? actor.id : null,
    },
    update: {
      components: input.lines,
      ...totals,
      uploadedFileId: input.uploadedFileId ?? null,
      published: input.published,
    },
    select: slipSelect,
  });

  return { ok: true, slip: toLoadedSlip(row) };
}

/**
 * Delete a slip, and the uploaded file it was the only reason to keep —
 * the same ownership rule the chat cleanup follows.
 */
export async function deleteSlip(actor: SessionActor, slipId: string) {
  if (!canManagePayroll(actor)) return;

  const slip = await db.salarySlip.findFirst({
    where: { id: slipId, companyId: actor.companyId },
    select: { id: true, uploadedFileId: true },
  });

  if (!slip) return;

  await db.salarySlip.delete({ where: { id: slip.id } });

  if (slip.uploadedFileId) {
    await db.storedFile.deleteMany({
      where: { id: slip.uploadedFileId, companyId: actor.companyId },
    });
  }
}

/** Everyone a slip can be generated for. */
export async function loadPayrollEmployees(actor: SessionActor) {
  return db.employee.findMany({
    where: { companyId: actor.companyId, deletedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, employeeCode: true },
  });
}
