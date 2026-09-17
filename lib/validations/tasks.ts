import { z } from "zod";
import {
  DUE_WINDOWS,
  isHttpUrl,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/tasks";
import { TIMER_ACTIONS } from "@/lib/task-timer";

/**
 * Validation for tasks, comments and attachments (Rules.md section 4 — every
 * request body is validated before anything touches the database).
 *
 * Mirrors lib/validations/projects.ts: optional free text accepts the empty
 * string an untouched HTML input submits, and the write resolver is what turns
 * it into `null`.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional()
  .or(z.literal(""));

/**
 * Estimated effort in hours, kept as a string all the way to the Decimal
 * column. Bounded by the column itself (6 digits, 2 decimals) and by what an
 * estimate can mean: a task nobody could finish in 9999 hours is a project.
 */
const optionalHours = z
  .string()
  .trim()
  .regex(
    /^\d{1,4}(\.\d{1,2})?$/,
    "Enter hours as a number, for example 6 or 4.5"
  )
  .optional()
  .or(z.literal(""));

/**
 * A task has exactly one of three target shapes: on a project, filed
 * directly under a client, or fully general/personal (both empty).
 * Enforced here, not in the database — the same style the previously
 * project-only nullable `projectId` already used.
 */
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(3, "Give the task a title").max(160),
    /** Empty means no project — either a client-direct or general task. */
    projectId: optionalText(40),
    /** Empty means no client — either a project or general task. */
    clientId: optionalText(40),
    description: optionalText(4000),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    /** Empty means unassigned; otherwise an Employee id. */
    assigneeId: optionalText(40),
    dueDate: optionalDate,
    estimatedHours: optionalHours,
  })
  .superRefine((value, ctx) => {
    if (value.projectId && value.clientId) {
      ctx.addIssue({
        code: "custom",
        message: "A task is on a project or a client, not both",
        path: ["clientId"],
      });
    }
  });

export const updateTaskSchema = createTaskSchema;

/**
 * Moving a task through the flow is its own request, separate from the edit
 * form — the same split the client and employee status routes use, so a status
 * change is never a side effect of saving unrelated fields.
 */
export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});

/**
 * Running a task's timer (Phase 12 — task time tracking). One action per request, the
 * same shape as the status route — what the timer does to the task's status
 * follows from the action (`statusAfter` in lib/task-timer.ts) rather than
 * being sent alongside it, so the two can never disagree.
 */
export const taskTimerSchema = z.object({
  action: z.enum(TIMER_ACTIONS),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Write a comment").max(5000),
});

export const attachmentSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Paste a link to the file")
    .max(2000)
    .refine(isHttpUrl, "Enter a link starting with http:// or https://"),
  label: optionalText(120),
});

/**
 * List filters. Unknown or malformed values are dropped rather than erroring,
 * because these come from a URL a user can freely edit.
 */
export const taskFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  projectId: z.string().trim().max(40).optional().catch(undefined),
  clientId: z.string().trim().max(40).optional().catch(undefined),
  assigneeId: z.string().trim().max(40).optional().catch(undefined),
  status: z.enum(TASK_STATUSES).optional().catch(undefined),
  priority: z.enum(TASK_PRIORITIES).optional().catch(undefined),
  due: z.enum(DUE_WINDOWS).optional().catch(undefined),
});

/** Which of the two task views to render. The board is the default. */
export const taskViewSchema = z
  .enum(["board", "list"])
  .optional()
  .catch(undefined);

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskStatusInput = z.infer<typeof taskStatusSchema>;
export type TaskTimerInput = z.infer<typeof taskTimerSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type AttachmentInput = z.infer<typeof attachmentSchema>;
export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;
