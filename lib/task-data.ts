import { invalidReference as invalid, type WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { canJoinTeam, isClosed } from "@/lib/projects";
import { completionFor, isOpen } from "@/lib/tasks";
import { formatPercent } from "@/lib/format";
import type { SelectOption } from "@/components/forms/fields";
import type {
  ClientStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/generated/prisma/enums";

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
  dueDate?: string;
  estimatedHours?: string;
};

export type TaskWriteData = {
  title: string;
  projectId: string | null;
  clientId: string | null;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  estimatedHours?: string | null;
  completedAt?: Date | null;
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
 * what lets a finished task keep its original completion date through an
 * unrelated save.
 */
export async function resolveTaskWrite(
  actor: SessionActor,
  input: TaskInput,
  project: TaskProject | null,
  client: TaskClient | null = null,
  current?: { status: TaskStatus; completedAt: Date | null },
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

  // --- Assignee -----------------------------------------------------------
  if (input.assigneeId !== undefined) {
    const assigneeId = input.assigneeId.trim();

    if (!assigneeId) {
      // Unassigned is a real state: work in the backlog nobody has picked up.
      data.assigneeId = null;
    } else {
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
  { openOnly = false }: { openOnly?: boolean } = {}
): Promise<SelectOption[]> {
  const projects = await db.project.findMany({
    where: scopedWhere(actor),
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      client: { select: { name: true } },
    },
  });

  return projects
    .filter((project) => !openOnly || !isClosed(project.status))
    .map((project) => ({
      value: project.id,
      label: `${project.name} — ${project.client.name}`,
    }));
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
 * Everyone who could appear in the assignee filter.
 *
 * Only people who actually hold a task, so the filter lists what is there to
 * find. Suspended people are included: their work still has to be findable and
 * handed on.
 */
export async function loadAssigneeFilterOptions(
  actor: SessionActor
): Promise<SelectOption[]> {
  const employees = await db.employee.findMany({
    where: scopedWhere(actor, { assignedTasks: { some: { deletedAt: null } } }),
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  return employees.map((employee) => ({
    value: employee.id,
    label: employee.fullName,
  }));
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
  /** Phases.md Phase 6 — whose workload a write to this task can change. */
  assigneeId: string | null;
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
      assigneeId: true,
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
