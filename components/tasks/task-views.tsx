import Link from "next/link";
import { formatDate } from "@/lib/format";
import { isOverdue, TASK_STATUSES } from "@/lib/tasks";
import {
  OverdueBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
  taskStatusLabel,
} from "@/components/tasks/status-badge";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { Card, CardContent } from "@/components/ui/card";
import type { TaskPriority, TaskStatus } from "@/lib/generated/prisma/enums";
import { cn } from "cn";

/**
 * The two ways a task list is shown (Phases.md Phase 5 — "task board (Kanban)
 * + list view").
 *
 * Both render the same rows from the same query — the page decides which to
 * show from the URL — so a filtered board and a filtered list can never
 * disagree about what is in them. Both are server components; the only
 * interactive part is the status control on each row.
 */
export type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  assignee: { id: string; fullName: string } | null;
  createdById: string | null;
  /**
   * Carries the lead because a task is governed by its project: the page's
   * `canManage` reads it to decide, per row, whether the status control is
   * shown (`canManageTask` in lib/permissions.ts). `null` for a client-direct
   * or fully standalone task, neither of which has a project to be governed
   * by.
   */
  project: { id: string; name: string; leadAccountId: string | null } | null;
  /** Set only when `project` is null and the task is filed under a client. */
  client: { id: string; name: string } | null;
};

/** Whether the viewer may move a given task. */
export type Manageable = (task: TaskSummary) => boolean;

function TaskTitle({ task }: { task: TaskSummary }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="text-brand-brown font-medium underline-offset-4 hover:underline"
    >
      {task.title}
    </Link>
  );
}

/**
 * A task's target: its project, the client it is filed directly under, or
 * "Personal task" when it has neither.
 */
function TaskProjectLabel({
  project,
  client,
  className,
}: {
  project: TaskSummary["project"];
  client: TaskSummary["client"];
  className?: string;
}) {
  if (project) {
    return (
      <Link
        href={`/projects/${project.id}`}
        className={cn(
          "text-text-secondary underline-offset-4 hover:underline",
          className
        )}
      >
        {project.name}
      </Link>
    );
  }

  if (client) {
    return (
      <Link
        href={`/projects/clients/${client.id}`}
        className={cn(
          "text-text-secondary underline-offset-4 hover:underline",
          className
        )}
      >
        {client.name}
      </Link>
    );
  }

  return (
    <span className={cn("text-text-secondary", className)}>
      Personal task
    </span>
  );
}

function Due({ task, now }: { task: TaskSummary; now: Date }) {
  if (!task.dueDate) return <span className="text-text-secondary">—</span>;

  return isOverdue(task, now) ? (
    <span className="text-danger-text">{formatDate(task.dueDate)}</span>
  ) : (
    <span className="text-text-secondary">{formatDate(task.dueDate)}</span>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function TaskBoard({
  tasks,
  canManage,
  now,
}: {
  tasks: TaskSummary[];
  canManage: Manageable;
  now: Date;
}) {
  return (
    // Four columns side by side, scrolling horizontally rather than reflowing:
    // a board that stacks into one column on a phone is just a list, and the
    // list view already exists for that.
    <div className="flex gap-4 overflow-x-auto pb-2">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((task) => task.status === status);

        return (
          <section
            key={status}
            aria-label={taskStatusLabel(status)}
            className="flex w-72 shrink-0 flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <TaskStatusBadge status={status} />
              <span className="text-text-secondary text-meta">
                {column.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {column.length === 0 ? (
                <p className="border-border text-text-secondary text-meta rounded-xl border border-dashed px-3 py-6 text-center">
                  Nothing here
                </p>
              ) : (
                column.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="flex flex-col gap-2 py-2">
                      <TaskTitle task={task} />

                      <TaskProjectLabel
                        project={task.project}
                        client={task.client}
                        className="text-meta"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <TaskPriorityBadge priority={task.priority} />
                        {isOverdue(task, now) ? <OverdueBadge /> : null}
                      </div>

                      <p className="text-text-secondary text-meta">
                        {task.assignee?.fullName ?? "Unassigned"}
                        {task.dueDate
                          ? ` · due ${formatDate(task.dueDate)}`
                          : ""}
                      </p>

                      {canManage(task) ? (
                        <TaskStatusSelect
                          taskId={task.id}
                          status={task.status}
                          label={`Move ${task.title}`}
                          hideLabel
                        />
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function TaskList({
  tasks,
  canManage,
  now,
}: {
  tasks: TaskSummary[];
  canManage: Manageable;
  now: Date;
}) {
  return (
    <Card>
      <CardContent className="py-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            {/* Design.md section 6: surface-muted header, thin row rules, no
                zebra striping. */}
            <thead className="bg-surface-muted">
              <tr className="text-text-secondary text-meta">
                <th className="rounded-l-lg px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Assignee</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="rounded-r-lg px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-border border-b">
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskTitle task={task} />
                      {isOverdue(task, now) ? <OverdueBadge /> : null}
                    </div>
                  </td>
                  <td className="text-text-secondary px-3 py-3">
                    <TaskProjectLabel
                      project={task.project}
                      client={task.client}
                    />
                  </td>
                  <td className="text-text-secondary px-3 py-3">
                    {task.assignee ? (
                      <Link
                        href={`/employees/${task.assignee.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {task.assignee.fullName}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Due task={task} now={now} />
                  </td>
                  <td className="px-3 py-3">
                    <TaskPriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-3 py-3">
                    {canManage(task) ? (
                      <TaskStatusSelect
                        taskId={task.id}
                        status={task.status}
                        label={`Move ${task.title}`}
                        hideLabel
                        className="w-36"
                      />
                    ) : (
                      <TaskStatusBadge status={task.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
