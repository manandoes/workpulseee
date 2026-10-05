"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPercent } from "@/lib/format";
import { workloadBand, workloadBandLabel } from "@/lib/workload";
import type { MyWorkTask } from "@/lib/my-work-data";
import { isOverdue, isDueToday, isOpen } from "@/lib/tasks";
import { formatDate } from "@/lib/format";
import { OverdueBadge, TaskPriorityBadge } from "@/components/tasks/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, ListChecks } from "lucide-react";

type WorkloadBreakdown = {
  totalTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  completedTasks: number;
};

function computeBreakdown(tasks: MyWorkTask[], now: Date): WorkloadBreakdown {
  const openTasks = tasks.filter((t) => isOpen(t.status));
  return {
    totalTasks: tasks.length,
    pendingTasks: openTasks.length,
    overdueTasks: openTasks.filter((t) => isOverdue(t, now)).length,
    dueTodayTasks: openTasks.filter((t) => isDueToday(t, now)).length,
    inProgressTasks: openTasks.filter((t) => t.status !== "Todo").length,
    todoTasks: openTasks.filter((t) => t.status === "Todo").length,
    completedTasks: tasks.filter((t) => !isOpen(t.status)).length,
  };
}

export function WorkloadDetailDialog({
  open,
  onOpenChange,
  tasks,
  workloadPercent,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: MyWorkTask[];
  workloadPercent: number | null;
  now: Date;
}) {
  const breakdown = computeBreakdown(tasks, now);
  const band = workloadPercent !== null ? workloadBand(workloadPercent) : null;

  const statRows: {
    label: string;
    value: string;
    icon: React.ReactNode;
    muted?: boolean;
  }[] = [
    {
      label: "Workload",
      value: workloadPercent !== null ? formatPercent(workloadPercent) : "—",
      icon:
        workloadPercent !== null && band ? (
          <span
            className={
              band === "success"
                ? "text-success"
                : band === "warning"
                  ? "text-warning"
                  : "text-danger"
            }
          >
            {workloadBandLabel(band)}
          </span>
        ) : null,
    },
    {
      label: "Total tasks",
      value: String(breakdown.totalTasks),
      icon: <ListChecks className="size-4 text-text-secondary" />,
    },
    {
      label: "Pending",
      value: String(breakdown.pendingTasks),
      icon: <Clock className="size-4 text-text-secondary" />,
    },
    {
      label: "In progress",
      value: String(breakdown.inProgressTasks),
      icon: <CheckCircle2 className="size-4 text-success" />,
    },
    {
      label: "Todo",
      value: String(breakdown.todoTasks),
      icon: <ListChecks className="size-4 text-text-secondary" />,
    },
    {
      label: "Overdue",
      value: String(breakdown.overdueTasks),
      icon: <AlertTriangle className="size-4 text-danger" />,
      muted: breakdown.overdueTasks > 0,
    },
    {
      label: "Due today",
      value: String(breakdown.dueTodayTasks),
      icon: <Clock className="size-4 text-warning" />,
      muted: breakdown.dueTodayTasks > 0,
    },
    {
      label: "Completed",
      value: String(breakdown.completedTasks),
      icon: <CheckCircle2 className="size-4 text-success" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Workload details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            {statRows.map((row) => (
              <div
                key={row.label}
                className={`flex items-center gap-2 rounded-md border border-border p-3 ${row.muted ? "bg-danger/5" : "bg-surface"}`}
              >
                {row.icon}
                <div className="flex flex-col">
                  <span className="text-text-secondary text-meta">
                    {row.label}
                  </span>
                  <span
                    className={`text-h3 font-semibold ${row.muted ? "text-danger" : "text-brand-brown"}`}
                  >
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Task list preview */}
          <div className="flex flex-col gap-2">
            <h4 className="text-h4 font-medium text-brand-brown">
              Recent tasks
            </h4>
            {tasks.length === 0 ? (
              <p className="text-text-secondary text-sm">No tasks assigned.</p>
            ) : (
              <div className="flex max-h-60 flex-col gap-2 overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <TaskPreviewCard key={task.id} task={task} now={now} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskPreviewCard({
  task,
  now,
}: {
  task: MyWorkTask;
  now: Date;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-brand-brown font-medium">{task.title}</p>
          {isOverdue(task, now) ? <OverdueBadge /> : null}
        </div>
        <p className="text-text-secondary text-meta">
          {task.project?.name ?? "Personal task"}
          {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : " · no due date"}
        </p>
        <div className="flex items-center gap-2">
          <TaskPriorityBadge priority={task.priority} />
          <span
            className={`text-meta ${
              task.status === "Todo"
                ? "text-text-secondary"
                : task.status === "In Progress"
                  ? "text-success"
                  : "text-text-secondary"
            }`}
          >
            {task.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
