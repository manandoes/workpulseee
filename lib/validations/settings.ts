import { z } from "zod";

/**
 * Validation for company-wide settings (Rules.md section 4 — every request
 * body is validated before anything touches the database).
 *
 * Kept as a string all the way to the integer column, the same pattern
 * `lib/validations/tasks.ts` uses for estimated hours: an untouched form field
 * always submits a string, so the schema should accept exactly what the input
 * can hold rather than a type the browser never sends.
 */
export const workloadSettingsSchema = z.object({
  /** Bounded at a week's worth of hours - nobody has more than 168 in a week. */
  weeklyCapacityHours: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole number of hours")
    .refine((value) => {
      const hours = Number(value);
      return hours >= 1 && hours <= 168;
    }, "Enter between 1 and 168 hours"),
});

export type WorkloadSettingsInput = z.infer<typeof workloadSettingsSchema>;

/**
 * Early-warning thresholds (Phases.md Phase 9 — "configurable thresholds per
 * company"). Same string-all-the-way-to-the-column shape as
 * `workloadSettingsSchema`.
 */
export const alertSettingsSchema = z.object({
  overloadThresholdPercent: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole percentage")
    .refine((value) => {
      const percent = Number(value);
      return percent >= 1 && percent <= 300;
    }, "Enter between 1 and 300"),
  stalledProjectDays: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole number of days")
    .refine((value) => {
      const days = Number(value);
      return days >= 1 && days <= 365;
    }, "Enter between 1 and 365 days"),
  agingApprovalDays: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole number of days")
    .refine((value) => {
      const days = Number(value);
      return days >= 1 && days <= 365;
    }, "Enter between 1 and 365 days"),
});

export type AlertSettingsInput = z.infer<typeof alertSettingsSchema>;

/**
 * The HRMS/PMS sidebar mode (Plan: dashboard-mode toggle) — a display
 * preference, not tenant data, so it is the one setting in this file with no
 * DB column behind it (`app/api/settings/dashboard-mode/route.ts` writes it
 * straight to a cookie).
 */
export const dashboardModeSchema = z.object({
  mode: z.enum(["hrms", "pms"]),
});

export type DashboardModeInput = z.infer<typeof dashboardModeSchema>;

/**
 * Dark/light theme (Plan: theme toggle) — same shape as `dashboardModeSchema`
 * and, like it, cookie-only: no DB column behind it
 * (`app/api/settings/theme/route.ts`).
 */
export const themeSettingsSchema = z.object({
  theme: z.enum(["light", "dark"]),
});

export type ThemeSettingsInput = z.infer<typeof themeSettingsSchema>;

/**
 * Owner-only company branding (Plan: brand color) — unlike theme mode, this
 * is persisted on `Company.brandColor` (`app/api/settings/branding/route.ts`),
 * since it is company-wide, not a personal preference.
 */
export const brandColorSchema = z.object({
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Enter a hex color like #ffcc00"),
});

export type BrandColorInput = z.infer<typeof brandColorSchema>;

/**
 * Owner-only email delivery settings (Settings -> Email delivery,
 * `canManageEmailSettings`) — the company's own Resend/Brevo identity for
 * invite and notification emails, persisted on `Company`
 * (`app/api/settings/email/route.ts`).
 *
 * `emailApiKey` is optional and blank means "keep the currently stored key":
 * the form never receives the real key back to prefill, so leaving it blank
 * is how an owner changes the provider or from-address without re-entering a
 * key that hasn't changed.
 */
export const emailSettingsSchema = z.object({
  emailProvider: z.enum(["resend", "brevo"]),
  emailFromAddress: z
    .string()
    .trim()
    .min(3, "Enter a from address")
    .max(200, "Keep this under 200 characters"),
  emailApiKey: z
    .string()
    .trim()
    .max(200, "Keep this under 200 characters")
    .optional()
    .or(z.literal("")),
});

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;
