import type { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";

/**
 * Task business logic (Rules.md section 5 — rules live in `lib/`, not inside
 * route handlers or components).
 *
 * Everything here is pure and takes `now` as an argument rather than reading
 * the clock, so the overdue rule — the one piece of Phase 5 that changes
 * meaning as time passes — can be tested at a fixed instant.
 */

// ---------------------------------------------------------------------------
// Status and priority vocabulary
// ---------------------------------------------------------------------------

/**
 * The status flow from PRD.md section 6.3, in the order work moves through it.
 * This is also the left-to-right order of the board columns.
 *
 * "Overdue" is not here on purpose. It is a fact about a task's deadline, not a
 * stage of its work: a task that has slipped is still To Do or In Progress, and
 * folding the two together would lose the stage and need a nightly job to stay
 * true. `isOverdue` derives it instead, from the row as it already stands.
 */
export const TASK_STATUSES = [
  "Todo",
  "InProgress",
  "InReview",
  "Done",
] as const;

/** Least to most urgent — the order pickers list and boards sort by. */
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;

/** Statuses that still represent outstanding work. */
export const OPEN_STATUSES = TASK_STATUSES.filter(
  (status) => status !== "Done"
) as readonly TaskStatus[];

export function isOpen(status: TaskStatus): boolean {
  return status !== "Done";
}

// ---------------------------------------------------------------------------
// Deadlines (Phases.md Phase 5 — overdue auto-flagging)
// ---------------------------------------------------------------------------

/**
 * Midnight UTC at the start of the day `now` falls in.
 *
 * Deadlines are date-only and stored at UTC midnight, so every comparison has
 * to happen in UTC too. Comparing against the raw clock would make a task due
 * today read as overdue from one minute past midnight.
 */
export function startOfDayUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/** `days` after the start of today, used for the "due this week" window. */
export function daysFromToday(now: Date, days: number): Date {
  const start = startOfDayUtc(now);
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

export type Deadline = {
  status: TaskStatus;
  dueDate: Date | string | null;
};

/**
 * Has this task missed its deadline?
 *
 * True only for work that is still open and whose due date is in the past — a
 * task due today has until the end of today, and a finished task cannot become
 * overdue afterwards no matter how long it sits there.
 */
export function isOverdue(task: Deadline, now: Date): boolean {
  if (!task.dueDate || !isOpen(task.status)) return false;

  const due =
    task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;

  return due.getTime() < startOfDayUtc(now).getTime();
}

/**
 * When a task's completion timestamp should be, given the status it is moving
 * to and the timestamp it currently carries.
 *
 * Reaching Done stamps the moment; moving back out of Done clears it, because
 * a task in review that still claims a completion date would tell Phase 8's
 * on-time-delivery score something untrue. Re-saving a task that is already
 * Done keeps the original timestamp rather than sliding it forward.
 */
export function completionFor(
  status: TaskStatus,
  current: Date | null,
  now: Date
): Date | null {
  if (status !== "Done") return null;
  return current ?? now;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Share of tasks that are Done, as a percentage (PRD.md section 6.7).
 *
 * `null` rather than 0 when there are no tasks at all: a project nobody has
 * planned work for is not a project that is 0% delivered.
 */
export function completionPercent(total: number, done: number): number | null {
  if (total <= 0) return null;
  return (done / total) * 100;
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

/** The deadline windows the list offers. */
export const DUE_WINDOWS = ["overdue", "today", "week"] as const;
export type DueWindow = (typeof DUE_WINDOWS)[number];

/** Chosen in the assignee filter to mean "nobody has picked this up". */
export const UNASSIGNED = "unassigned";

export type TaskFilters = {
  q?: string;
  projectId?: string;
  clientId?: string;
  /** An employee id, or `UNASSIGNED`. */
  assigneeId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: DueWindow;
};

/**
 * Build the `where` fragment for a task list.
 *
 * Returns only the filter half — the caller wraps it in `scopedWhere()` so the
 * tenant filter is applied last and can never be overridden (Rules.md
 * section 2).
 *
 * The deadline windows are expressed as database predicates rather than by
 * filtering rows in memory, so "show me everything overdue" stays one query no
 * matter how many tasks a company has.
 */
export function taskFilter(filters: TaskFilters, now: Date) {
  const where: Record<string, unknown> = {};

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      // What people actually type when hunting for "the Northwind copy deck".
      { project: { name: { contains: q, mode: "insensitive" } } },
      { assignee: { fullName: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.clientId) {
    // A task on a client's project, or filed directly under the client with
    // no project in between — nested under its own key rather than
    // `where.OR` so it survives alongside the `q` search's own OR above.
    where.AND = [
      {
        OR: [
          { project: { clientId: filters.clientId } },
          { clientId: filters.clientId },
        ],
      },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;

  if (filters.assigneeId === UNASSIGNED) {
    where.assigneeId = null;
  } else if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  }

  if (filters.due) {
    // Every window is about work still to do, so a finished task never appears
    // in one — the same rule `isOverdue` applies to a single row.
    where.status = filters.status ?? { not: "Done" };

    if (filters.due === "overdue") {
      where.dueDate = { lt: startOfDayUtc(now) };
    } else if (filters.due === "today") {
      where.dueDate = { gte: startOfDayUtc(now), lt: daysFromToday(now, 1) };
    } else {
      // "This week" means the next seven days, and includes anything already
      // late: a manager clearing the week needs to see what is behind it.
      where.dueDate = { lt: daysFromToday(now, 7) };
    }
  }

  return where;
}

/**
 * Who may see a given company's tasks, layered on top of `taskFilter` and the
 * tenant scope.
 *
 * A task on a project stays visible to anyone the section already lets in
 * (`canViewTasks`); a standalone task is personal — visible only to whoever
 * raised it (a `CompanyAccount`, on `/tasks`) or, for an Employee actor, only
 * to themself as its assignee (used by "My Work", which every Employee's own
 * tasks flow through regardless of project).
 */
export function taskVisibilityFilter(actor: {
  id: string;
  accountType: "company" | "employee";
}) {
  return {
    OR: [
      { projectId: { not: null } },
      actor.accountType === "employee"
        ? { assigneeId: actor.id }
        : { createdById: actor.id },
    ],
  };
}

/**
 * Board and list ordering: most urgent first, then by deadline, with undated
 * work last. Shared by every task query so the two views agree.
 */
export const TASK_ORDER = [
  { priority: "desc" },
  { dueDate: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
] as const;

// ---------------------------------------------------------------------------
// Attachment links
// ---------------------------------------------------------------------------

/**
 * Is this a link we are willing to store and render?
 *
 * Only `http:` and `https:` pass. Anything else — `javascript:` above all, but
 * also `data:` and `file:` — would turn an attachment into a payload aimed at
 * whoever clicks it, and Architecture.md section 8 puts validating what people
 * attach before storage, not after.
 */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * What to call an attachment when the person adding it did not say.
 *
 * The last meaningful part of the path is almost always the file name, which
 * beats showing a 200-character URL in a list. Falls back to the host for a
 * link that is just a domain.
 */
export function attachmentLabel(url: string, label?: string): string {
  const given = label?.trim();
  if (given) return given;

  try {
    const parsed = new URL(url.trim());
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(last ?? "") || parsed.host;
  } catch {
    return url.trim();
  }
}
