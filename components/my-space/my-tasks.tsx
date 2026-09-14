import { formatDate } from "@/lib/format";
import { isOverdue, startOfDayUtc } from "@/lib/tasks";
import type { MyWorkTask } from "@/lib/my-work-data";
import {
  OverdueBadge,
  TaskPriorityBadge,
} from "@/components/tasks/status-badge";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskTimer } from "@/components/tasks/task-timer";
import { EmptyState } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "My Work"'s task list (Phases.md Phase 10 — PRD.md section 6.9's "today's
 * tasks, upcoming deadlines").
 *
 * Each card carries its own timer (Phase 12 — task time tracking). Several can run at
 * once — they are independent clocks, and stopping one is deliberately not the
 * same action as starting another.
 *
 * Deliberately not `components/tasks/task-views.tsx`'s `TaskList`/`TaskBoard`:
 * both link task titles and project names into `/tasks/[id]`/`/projects/[id]`,
 * which are gated to delivery roles and would redirect an Employee away. Every
 * row here is already the viewer's own task, so the status control is always
 * shown — the route itself (`canUpdateTaskStatus`) is what actually enforces
 * that a given Employee may only move their own.
 */
export function MyTaskList({ tasks, now }: { tasks: MyWorkTask[]; now: Date }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Nothing on your plate"
        description="Tasks assigned to you will show up here, split into what's due now and what's coming up."
      />
    );
  }

  const dueNow = tasks.filter(
    (task) => isOverdue(task, now) || isDueToday(task, now)
  );
  const upcoming = tasks.filter((task) => !dueNow.includes(task));

  return (
    <div className="flex flex-col gap-6">
      <TaskGroup
        title="Due now"
        tasks={dueNow}
        now={now}
        emptyText="Nothing overdue or due today."
      />
      <TaskGroup
        title="Upcoming"
        tasks={upcoming}
        now={now}
        emptyText="Nothing else on deck."
      />
    </div>
  );
}

function isDueToday(task: MyWorkTask, now: Date): boolean {
  if (!task.dueDate) return false;
  return task.dueDate.getTime() === startOfDayUtc(now).getTime();
}

function TaskGroup({
  title,
  tasks,
  now,
  emptyText,
}: {
  title: string;
  tasks: MyWorkTask[];
  now: Date;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-text-secondary text-meta">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-brand-brown font-medium">{task.title}</p>
                  {isOverdue(task, now) ? <OverdueBadge /> : null}
                </div>

                <p className="text-text-secondary text-meta">
                  {task.project?.name ?? "Personal task"}
                  {task.dueDate
                    ? ` · due ${formatDate(task.dueDate)}`
                    : " · no due date"}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <TaskPriorityBadge priority={task.priority} />
                </div>

                <TaskStatusSelect
                  taskId={task.id}
                  status={task.status}
                  label={`Move ${task.title}`}
                  hideLabel
                  className="w-40"
                />

                <TaskTimer
                  taskId={task.id}
                  closedMs={task.timer.closedMs}
                  runningSince={
                    task.timer.runningSince
                      ? task.timer.runningSince.toISOString()
                      : null
                  }
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
