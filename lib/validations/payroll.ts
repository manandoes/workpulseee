import { z } from "zod";

/**
 * Validation for salary slips (Rules.md section 4).
 *
 * Amounts are integers in minor units — a fractional paisa is not a thing, and
 * accepting one here would put a number on a slip that cannot be paid.
 */

const componentKind = z.enum(["earning", "deduction"]);

const amountMinor = z
  .number()
  .int("Enter a whole amount")
  .min(0, "Amount cannot be negative")
  .max(1_000_000_000, "Amount is too large");

export const salaryComponentSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, "Name this component").max(120),
  kind: componentKind,
  defaultMinor: amountMinor.default(0),
});

export const salaryTemplateSchema = z.object({
  components: z
    .array(salaryComponentSchema)
    .min(1, "Add at least one component")
    .max(40, "That is too many components")
    // Keys address a line across template edits and slip regenerations, so a
    // duplicate would make two lines indistinguishable.
    .refine(
      (components) =>
        new Set(components.map((component) => component.key)).size ===
        components.length,
      { message: "Each component needs its own key" }
    ),
});

export const slipLineSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  kind: componentKind,
  amountMinor,
});

export const saveSlipSchema = z.object({
  employeeId: z.string().trim().min(1, "Choose an employee"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  lines: z.array(slipLineSchema).max(40),
  uploadedFileId: z.string().trim().min(1).nullish(),
  published: z.boolean().default(false),
});

export type SaveSlipInput = z.infer<typeof saveSlipSchema>;
export type SalaryTemplateInput = z.infer<typeof salaryTemplateSchema>;
