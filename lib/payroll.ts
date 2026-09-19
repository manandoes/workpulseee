/**
 * Salary slip rules (Plan: salary slips).
 *
 * Pure money math, kept apart from `lib/payroll-data.ts` so the totals are
 * unit-testable without a database — the one part of this feature where an
 * error is silently wrong rather than visibly broken.
 *
 * Amounts are whole minor units (paise for INR, cents for USD) everywhere
 * below. Floating-point rupees would accumulate rounding error across a dozen
 * component lines and produce a slip whose parts do not add up to its total.
 */

export type ComponentKind = "earning" | "deduction";

/** One line of the company's reusable salary structure. */
export type SalaryComponent = {
  key: string;
  label: string;
  kind: ComponentKind;
  /** Pre-filled when generating a slip; the amount is editable per employee. */
  defaultMinor: number;
};

/** The same line, with the amount actually paid for one month. */
export type SlipLine = {
  key: string;
  label: string;
  kind: ComponentKind;
  amountMinor: number;
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "—";
}

/** The structure a company starts from before it edits its own. */
export const DEFAULT_COMPONENTS: SalaryComponent[] = [
  { key: "basic", label: "Basic", kind: "earning", defaultMinor: 0 },
  { key: "hra", label: "House rent allowance", kind: "earning", defaultMinor: 0 },
  { key: "special", label: "Special allowance", kind: "earning", defaultMinor: 0 },
  { key: "pf", label: "Provident fund", kind: "deduction", defaultMinor: 0 },
  { key: "tax", label: "Income tax", kind: "deduction", defaultMinor: 0 },
];

export type SlipTotals = {
  grossMinor: number;
  deductionMinor: number;
  netMinor: number;
};

/**
 * Gross, deductions and net for a set of lines.
 *
 * Net is gross minus deductions and may legitimately be negative if deductions
 * exceed earnings — that is a data-entry mistake worth showing on the slip
 * rather than clamping to zero and hiding.
 */
export function computeTotals(lines: SlipLine[]): SlipTotals {
  let grossMinor = 0;
  let deductionMinor = 0;

  for (const line of lines) {
    if (line.kind === "earning") grossMinor += line.amountMinor;
    else deductionMinor += line.amountMinor;
  }

  return { grossMinor, deductionMinor, netMinor: grossMinor - deductionMinor };
}

/** Turns the company's structure into the starting lines of a new slip. */
export function linesFromComponents(
  components: SalaryComponent[]
): SlipLine[] {
  return components.map((component) => ({
    key: component.key,
    label: component.label,
    kind: component.kind,
    amountMinor: component.defaultMinor,
  }));
}

/** Minor units from a major-unit string a person typed ("45000.50" -> 4500050). */
export function toMinor(input: string): number {
  const amount = Number(input.trim());
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** Minor units back to a major-unit string for an input field. */
export function toMajorInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Minor units as a major-unit number, for `formatMoney`. */
export function toMajor(minor: number): number {
  return minor / 100;
}

/**
 * The period a slip covers, as a stable label.
 *
 * Also the shape the download filename uses, so a folder of saved slips sorts
 * chronologically rather than alphabetically by month name.
 */
export function periodLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`;
}

export function periodSlug(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Type guards for the JSON columns, which Prisma hands back as `unknown`. */
export function parseComponents(value: unknown): SalaryComponent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SalaryComponent =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as SalaryComponent).key === "string" &&
      typeof (item as SalaryComponent).label === "string" &&
      ((item as SalaryComponent).kind === "earning" ||
        (item as SalaryComponent).kind === "deduction")
  );
}

export function parseLines(value: unknown): SlipLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SlipLine =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as SlipLine).key === "string" &&
      typeof (item as SlipLine).amountMinor === "number" &&
      ((item as SlipLine).kind === "earning" ||
        (item as SlipLine).kind === "deduction")
  );
}
