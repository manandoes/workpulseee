import { z } from "zod";
import { PERFORMANCE_PERIODS } from "@/lib/performance";

/**
 * Validation for goals, feedback and the performance queue (Rules.md
 * section 4 — every request body is validated before anything touches the
 * database). Mirrors `lib/validations/requests.ts`.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional()
  .or(z.literal(""));

export const createGoalSchema = z.object({
  title: z.string().trim().min(3, "Give the goal a title").max(160),
  description: optionalText(2000),
  targetDate: optionalDate,
});

/**
 * A goal starts `Active` by default and is only ever moved on from here — the
 * same one-time-decision shape `decisionSchema` uses for requests.
 */
export const goalDecisionSchema = z.object({
  status: z.enum(["Achieved", "Missed"]),
});

/**
 * `rating` stays a string all the way to the route, like `amount` and
 * `estimatedHours` do elsewhere (`lib/validations/requests.ts`,
 * `lib/validations/tasks.ts`) — a `<select>` submits a string, and the
 * conversion to a number happens once, in `lib/performance-data.ts`.
 */
export const createFeedbackSchema = z.object({
  rating: z.enum(["1", "2", "3", "4", "5"]),
  body: z.string().trim().min(1, "Write the feedback").max(5000),
});

/**
 * Queue filters. Unknown or malformed values are dropped rather than
 * erroring, because these come from a URL a user can freely edit.
 */
export const performanceFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  departmentId: z.string().trim().max(40).optional().catch(undefined),
});

/**
 * The period control on an employee's performance page (Phase 13).
 *
 * Every field is `.catch(undefined)` for the same reason the queue filters
 * are: a hand-edited URL should quietly fall back to all time, which
 * `resolvePeriod` treats as the whole record, rather than erroring the page.
 */
export const performancePeriodSchema = z.object({
  period: z.enum(PERFORMANCE_PERIODS).optional().catch(undefined),
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type GoalDecisionInput = z.infer<typeof goalDecisionSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type PerformanceFiltersInput = z.infer<typeof performanceFiltersSchema>;
export type PerformancePeriodInput = z.infer<typeof performancePeriodSchema>;
