import { invalidReference as invalid, type WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import {
  canAssignTaskToAccount,
  canManageProject,
  TASK_ASSIGNABLE_ACCOUNT_ROLES,
  type SessionActor,
} from "@/lib/permissions";
import { canJoinTeam, isClosed } from "@/lib/projects";
import {
  accountAssigneeValue,
  completionFor,
  completionNoteFor,
  isOpen,
} from "@/lib/tasks";
import { formatPercent } from "@/lib/format";
import type { SelectOption } from "@/components/forms/fields";
import type {
  ClientStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/generated/prisma/enums";
import { LEVEL_LABELS } from "@/lib/permission-grants";

const ACTIVE_CLIENT_STATUS: ClientStatus = "Active";

/**
 * Database access for tasks.
 *
 * Holds the write resolution the mutating routes share and the option lists the
 * pages share, so "does this id belong to my company" and "can this person be
 * given this task" exist in exactly one place.
 *
 * PATCH semantics match the project and employee routes: a key absent from the
 * request is left untouched, and an explicit empty string is what clears a
 * value.
 *
 * Every query here goes through `scopedWhere`, so a project or employee id
 * belonging to another company simply will not be found (Rules.md section 2).
 */

const text = (value: string | undefined) => (value ? value : null);

/** Dates arrive as `YYYY-MM-DD` and are stored at UTC midnight. */
const dateOrNull = (value: string | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

/** Hours stay a string into the Decimal column, never through a float. */
const hoursOrNull = (value: string | undefined) => (value ? value : null);

// ---------------------------------------------------------------------------
// The project a task hangs off
// ---------------------------------------------------------------------------

/**
 * The project fields a task write needs: enough to prove the tenant and to run
 * `canManageTask`.
 */
export type TaskProject = {
  id: string;
  name: string;
  leadAccountId: string | null;
};

/**
 * Load the project a task is being created on or moved to.
 *
 * The row is returned rather than authorised here, because deciding who may
 * write is the route's job and it needs the lead to decide.
 */
export function findTaskProject(
  actor: SessionActor,
  projectId: string
): Promise<TaskProject | null> {
  return db.project.findFirst({
    where: scopedWhere(actor, { id: projectId }),
    select: { id: true, name: true, leadAccountId: true },
  });
}

/** What every route says when a project id names nothing it can see. */
export const unknownProject = () =>
  invalid("projectId", "That project is not in your company.");

// ---------------------------------------------------------------------------
// The client a task is filed directly under (no project in between)
// ---------------------------------------------------------------------------

/** The client fields a task write needs. */
export type TaskClient = {
  id: string;
  name: string;
};

/**
 * Load the client a task is being filed directly under.
 *
 * Restricted to active clients, mirroring `loadTaskProjects`'s `openOnly`
 * reasoning: new work should not land on an archived client.
 */
export function findTaskClient(
  actor: SessionActor,
  clientId: string
): Promise<TaskClient | null> {
  return db.client.findFirst({
    where: scopedWhere(actor, { id: clientId, status: ACTIVE_CLIENT_STATUS }),
    select: { id: true, name: true },
  });
}

/** What every route says when a client id names nothing it can see. */
export const unknownClient = () =>
  invalid("clientId", "That client is not in your company.");

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type TaskInput = {
  title: string;
  /**
   * Not read here — the caller already resolved it to `project`/`client`
   * below. Present only because it's part of the schema the route parses.
   */
  projectId?: string;
  clientId?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  assigneeAccountId?: string;
  dueDate?: string;
  estimatedHours?: string;
  completionNote?: string;
};

export type TaskWriteData = {
  title: string;
  projectId: string | null;
  clientId: string | null;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  assigneeAccountId?: string | null;
  dueDate?: Date | null;
  estimatedHours?: string | null;
  completedAt?: Date | null;
  completionNote?: string | null;
};

export type TaskWriteResolution =
  { ok: true; data: TaskWriteData } | WriteFailure;

/**
 * Resolve a create or an edit against the database.
 *
 * `project` has already been loaded through the tenant filter and authorised
 * by the caller, or is `null` for a client-direct or a fully standalone
 * task. `client` is likewise loaded and authorised by the caller and is
 * only ever set when `project` is `null` — a task is on a project or a
 * client, never both (`lib/validations/tasks.ts`'s `superRefine`).
 * `current` is the task being edited, and is absent when creating — it is
 * what lets a finished task keep its original completion date (and note)
 * through an unrelated save.
 */
export async function resolveTaskWrite(
  actor: SessionActor,
  input: TaskInput,
  project: TaskProject | null,
  client: TaskClient | null = null,
  current?: {
    status: TaskStatus;
    completedAt: Date | null;
    completionNote: string | null;
  },
  now: Date = new Date()
): Promise<TaskWriteResolution> {
  const data: TaskWriteData = {
    title: input.title,
    projectId: project ? project.id : null,
    clientId: project ? null : client ? client.id : null,
  };

  if (input.description !== undefined) {
    data.description = text(input.description);
  }
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.dueDate !== undefined) data.dueDate = dateOrNull(input.dueDate);
  if (input.estimatedHours !== undefined) {
    data.estimatedHours = hoursOrNull(input.estimatedHours);
  }

  // --- Status, and the completion timestamp that follows from it ----------
  //
  // The two always move together, so `completedAt` is never written by hand:
  // reaching Done stamps it and leaving Done clears it (lib/tasks.ts).
  const status = input.status ?? current?.status ?? "Todo";
  if (input.status !== undefined || !current) data.status = status;
  data.completedAt = completionFor(status, current?.completedAt ?? null, now);
  data.completionNote = completionNoteFor(
    status,
    input.completionNote,
    current?.completionNote ?? null
  );

  // --- Assignee -----------------------------------------------------------
  //
  // At most one: an employee (`assigneeId`) or, Plan: allot tasks to a
  // Manager or HR, a company login (`assigneeAccountId`) — the schema already
  // refused a body naming both. Sending either key replaces whoever holds the
  // task with exactly what was named, so the other kind is always cleared.
  if (input.assigneeId !== undefined || input.assigneeAccountId !== undefined) {
    const assigneeId = input.assigneeId?.trim() ?? "";
    const assigneeAccountId = input.assigneeAccountId?.trim() ?? "";

    // Unassigned is a real state: work in the backlog nobody has picked up.
    data.assigneeId = null;
    data.assigneeAccountId = null;

    if (assigneeAccountId) {
      const account = await db.companyAccount.findFirst({
        where: scopedWhere(actor, { id: assigneeAccountId }),
        select: { id: true, fullName: true, role: true },
      });

      if (!account) {
        return invalid("assigneeAccountId", "That person is not in your company.");
      }

      if (!canAssignTaskToAccount(actor, account)) {
        return {
          ok: false,
          status: 403,
          code: "forbidden",
          field: "assigneeAccountId",
          message: `You can't allot a task to ${account.fullName}. Tasks can go to a Manager or HR, from someone at the same level or above.`,
        };
      }

      // Project teams are employees only, so unlike an employee below there
      // is no team to add a login to — it simply holds the task.
      data.assigneeAccountId = account.id;
    } else if (assigneeId) {
      const employee = await db.employee.findFirst({
        where: scopedWhere(actor, { id: assigneeId }),
        select: { id: true, fullName: true, status: true },
      });

      if (!employee) {
        return invalid("assigneeId", "That employee is not in your company.");
      }

      if (!canJoinTeam(employee.status)) {
        return {
          ok: false,
          status: 400,
          code: "employee_suspended",
          field: "assigneeId",
          message: `${employee.fullName} is suspended and cannot be given work.`,
        };
      }

      /**
       * A standalone task has no team to belong to, so any active employee
       * can take it. A project task's assignee is the project's team — but
       * rather than refusing someone who isn't on it yet, picking them adds
       * them to the team in the same step: assigning the work and staffing
       * the project are one action, not two.
       */
      if (project) {
        const onTeam = await db.projectMember.findUnique({
          where: {
            projectId_employeeId: {
              projectId: project.id,
              employeeId: employee.id,
            },
          },
          select: { id: true },
        });

        if (!onTeam) {
          await db.projectMember.create({
            data: {
              companyId: actor.companyId,
              projectId: project.id,
              employeeId: employee.id,
            },
          });
        }
      }

      data.assigneeId = employee.id;
    }
  }

  return { ok: true, data };
}

/**
 * Uploaded files named on a task write, checked before anything is created.
 *
 * `/api/files` accepts any signed-in upload, so it is the feature referencing
 * a file that authorises using it: each one must be in the actor's company,
 * uploaded by the actor, and not already attached somewhere else.
 */
export async function resolveAttachmentFiles(
  actor: SessionActor,
  fileIds: string[]
): Promise<{ ok: true; files: { id: string; name: string }[] } | WriteFailure> {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return { ok: true, files: [] };

  const files = await db.storedFile.findMany({
    where: {
      id: { in: ids },
      companyId: actor.companyId,
      uploadedById: actor.id,
      attachment: { is: null },
    },
    select: { id: true, name: true },
  });

  if (files.length !== ids.length) {
    return invalid(
      "attachmentFileIds",
      "One of those files could not be attached. Upload it again."
    );
  }

  return { ok: true, files };
}

// ---------------------------------------------------------------------------
// Reads shared by the task pages
// ---------------------------------------------------------------------------

/**
 * Projects a task can be filed under.
 *
 * `openOnly` is for the create form: filing new work under a completed or
 * cancelled project is almost always a mistake, while an existing task on one
 * still has to be editable.
 */
export async function loadTaskProjects(
  actor: SessionActor,
  {
    openOnly = false,
    manageableOnly = false,
  }: { openOnly?: boolean; manageableOnly?: boolean } = {}
): Promise<SelectOption[]> {
  const projects = await db.project.findMany({
    where: scopedWhere(actor),
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      leadAccountId: true,
      client: { select: { name: true } },
    },
  });

  return (
    projects
      .filter((project) => !openOnly || !isClosed(project.status))
      // `manageableOnly` is for the create form: only offer projects the API
      // will actually let this caller file a task under (`canManageTask`).
      .filter((project) => !manageableOnly || canManageProject(actor, project))
      .map((project) => ({
        value: project.id,
        label: `${project.name} — ${project.client.name}`,
      }))
  );
}

/**
 * Active clients a task can be filed directly under — the `openOnly` clients
 * counterpart to `loadTaskProjects`.
 */
export async function loadTaskClients(
  actor: SessionActor
): Promise<SelectOption[]> {
  const clients = await db.client.findMany({
    where: scopedWhere(actor, { status: ACTIVE_CLIENT_STATUS }),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return clients.map((client) => ({ value: client.id, label: client.name }));
}

/**
 * Who each project's work can go to: its team, minus anyone suspended.
 *
 * Keyed by project, because the task form has to swap the assignee list the
 * moment the project changes — one query at render beats a round trip on every
 * change of a select, and an agency's teams are small.
 *
 * Enforces the same rule as `resolveTaskWrite`, so the picker cannot offer
 * somebody the server would refuse.
 *
 * Options are ordered lowest-workload-first and labelled with the number, and
 * the least-loaded person is marked "— suggested" — Phases.md Phase 6's
 * "suggest next assignee based on lowest workload" through the picker that is
 * already here, rather than a separate UI surface. Skill/role matching (which
 * PRD.md section 6.4 also mentions) is out of scope: the schema has no skills
 * data to match against.
 */
export async function loadAssigneesByProject(
  actor: SessionActor
): Promise<Record<string, SelectOption[]>> {
  const members = await db.projectMember.findMany({
    where: {
      // Membership rows carry the tenant themselves, which is what scopes this
      // read (see the note on ProjectMember in schema.prisma).
      companyId: actor.companyId,
      employee: { deletedAt: null },
    },
    orderBy: { employee: { fullName: "asc" } },
    select: {
      projectId: true,
      employee: {
        select: {
          id: true,
          fullName: true,
          jobRole: true,
          status: true,
          workloadPercent: true,
        },
      },
    },
  });

  type Candidate = {
    id: string;
    fullName: string;
    jobRole: string | null;
    workloadPercent: number | null;
  };

  const byProject: Record<string, Candidate[]> = {};

  for (const { projectId, employee } of members) {
    if (!canJoinTeam(employee.status)) continue;

    (byProject[projectId] ??= []).push({
      id: employee.id,
      fullName: employee.fullName,
      jobRole: employee.jobRole,
      workloadPercent:
        employee.workloadPercent === null
          ? null
          : Number(employee.workloadPercent),
    });
  }

  const result: Record<string, SelectOption[]> = {};

  for (const [projectId, candidates] of Object.entries(byProject)) {
    // Unknown workload (never computed yet) sorts last: suggesting someone at
    // random ahead of a person with a known, real number would be a guess
    // dressed up as an answer.
    const sorted = [...candidates].sort((a, b) => {
      if (a.workloadPercent === b.workloadPercent) {
        return a.fullName.localeCompare(b.fullName);
      }
      if (a.workloadPercent === null) return 1;
      if (b.workloadPercent === null) return -1;
      return a.workloadPercent - b.workloadPercent;
    });

    result[projectId] = sorted.map((candidate, index) => {
      const base = candidate.jobRole
        ? `${candidate.fullName} — ${candidate.jobRole}`
        : candidate.fullName;

      const loaded =
        candidate.workloadPercent === null
          ? "workload unknown"
          : `${formatPercent(candidate.workloadPercent)} loaded`;

      const suggested =
        index === 0 && candidate.workloadPercent !== null ? " — suggested" : "";

      return { value: candidate.id, label: `${base} · ${loaded}${suggested}` };
    });
  }

  return result;
}

/**
 * Every active employee in the company, for the standalone-task assignee
 * picker and the "someone else" group offered alongside a project task's own
 * team (`resolveTaskWrite` adds them to the project's team if picked there).
 */
export async function loadCompanyEmployeeOptions(
  actor: SessionActor
): Promise<SelectOption[]> {
  const employees = await db.employee.findMany({
    where: scopedWhere(actor),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, jobRole: true, status: true },
  });

  return employees
    .filter((employee) => canJoinTeam(employee.status))
    .map((employee) => ({
      value: employee.id,
      label: employee.jobRole
        ? `${employee.fullName} — ${employee.jobRole}`
        : employee.fullName,
    }));
}

/**
 * The Manager/HR logins this actor may allot a task to (Plan: allot tasks to
 * a Manager or HR), for the task form's picker — the same rule
 * `resolveTaskWrite` enforces, so the picker cannot offer somebody the server
 * would refuse. Values are `accountAssigneeValue`s, since they share one
 * `<select>` with employee ids.
 */
export async function loadAssignableAccountOptions(
  actor: SessionActor
): Promise<SelectOption[]> {
  const accounts = await db.companyAccount.findMany({
    where: scopedWhere(actor, {
      role: { in: [...TASK_ASSIGNABLE_ACCOUNT_ROLES] },
    }),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, role: true },
  });

  return accounts
    .filter((account) => canAssignTaskToAccount(actor, account))
    .map((account) => ({
      value: accountAssigneeValue(account.id),
      label: `${account.fullName} — ${LEVEL_LABELS[account.role]}`,
    }));
}

/**
 * Everyone who could appear in the assignee filter.
 *
 * Only people who actually hold a task, so the filter lists what is there to
 * find — employees, then any Manager/HR login allotted one. Suspended people
 * are included: their work still has to be findable and handed on.
 */
export async function loadAssigneeFilterOptions(
  actor: SessionActor
): Promise<SelectOption[]> {
  const holdsATask = { assignedTasks: { some: { deletedAt: null } } };
  const [employees, accounts] = await Promise.all([
    db.employee.findMany({
      where: scopedWhere(actor, holdsATask),
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    db.companyAccount.findMany({
      where: scopedWhere(actor, holdsATask),
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    }),
  ]);

  return [
    ...employees.map((employee) => ({
      value: employee.id,
      label: employee.fullName,
    })),
    ...accounts.map((account) => ({
      value: accountAssigneeValue(account.id),
      label: `${account.fullName} (${LEVEL_LABELS[account.role]})`,
    })),
  ];
}

/**
 * A task loaded for a write, with everything the authorisation and the
 * completion-timestamp rules need.
 *
 * Read through the tenant filter, so a task in another company reads as "not
 * found" rather than revealing that it exists (Rules.md section 2). Callers
 * turn a `null` into their own 404 — HTTP responses stay in the routes.
 */
export type LoadedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  completedAt: Date | null;
  /** Plan: completion note — kept through an unrelated save while Done. */
  completionNote: string | null;
  /** Phases.md Phase 6 — whose workload a write to this task can change. */
  assigneeId: string | null;
  /** Plan: allot tasks to a Manager or HR — set instead of `assigneeId`. */
  assigneeAccountId: string | null;
  /**
   * Who raised it — what `canManageTask` checks for a client-direct or
   * fully standalone task.
   */
  createdById: string | null;
  project: TaskProject | null;
  /** Set only when `project` is null and the task is filed under a client. */
  clientId: string | null;
};

export function findTask(
  actor: SessionActor,
  id: string
): Promise<LoadedTask | null> {
  return db.task.findFirst({
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      title: true,
      status: true,
      completedAt: true,
      completionNote: true,
      assigneeId: true,
      assigneeAccountId: true,
      createdById: true,
      project: { select: { id: true, name: true, leadAccountId: true } },
      clientId: true,
    },
  });
}

/**
 * How many of an employee's assigned tasks are done vs. still open — the
 * Squad detail page's "tasks done/pending" figure (Phase 11). Scoped by
 * company only, the same way `lib/performance-data.ts`'s `scoreInputsFor`
 * reads this employee's tasks: the caller has already confirmed the id
 * belongs to this company.
 */
export async function countTasksByStatus(
  companyId: string,
  employeeId: string
): Promise<{ done: number; pending: number }> {
  const tasks = await db.task.findMany({
    where: { companyId, assigneeId: employeeId, deletedAt: null },
    select: { status: true },
  });

  return tasks.reduce(
    (counts, task) => {
      if (isOpen(task.status)) counts.pending += 1;
      else counts.done += 1;
      return counts;
    },
    { done: 0, pending: 0 }
  );
}
