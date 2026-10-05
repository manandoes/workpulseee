"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MyWorkTask } from "@/lib/my-work-data";
import { formatDate } from "@/lib/format";
import { OverdueBadge, TaskPriorityBadge } from "@/components/tasks/status-badge";
import { isOverdue } from "@/lib/tasks";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, ListChecks } from "lucide-react";

type TaskBucket = "overdue" | "dueToday" | "inProgress" | "upcoming" | "done";

const BUCKET_INFO: Record<
  TaskBucket,
  { title: string; description: string; icon: React.ReactNode }
> = {
  overdue: {
    title: "Overdue",
    description: "Tasks that are past their due date.",
    icon: <AlertTriangle className="size-5 text-danger" />,
  },
  dueToday: {
    title: "Due today",
    description: "Tasks due on the current day.",
    icon: <Clock className="size-5 text-warning" />,
  },
  inProgress: {
    title: "In progress",
    description: "Tasks currently being worked on.",
    icon: <CheckCircle2 className="size-5 text-success" />,
  },
  upcoming: {
    title: "Upcoming",
    description: "Tasks waiting to be started.",
    icon: <ListChecks className="size-5 text-text-secondary" />,
  },
  done: {
    title: "Done",
    description: "Recently completed tasks.",
    icon: <CheckCircle2 className="size-5 text-success" />,
  },
};

export function TasksDialog({
  open,
  onOpenChange,
  bucket,
  tasks,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket: TaskBucket;
  tasks: MyWorkTask[];
  now: Date;
}) {
  const info = BUCKET_INFO[bucket];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {info.icon}
            {info.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-text-secondary text-sm">{info.description}</p>
        <div className="flex flex-col gap-3 py-2">
          {tasks.length === 0 ? (
            <p className="text-text-secondary text-sm">
              No {info.title.toLowerCase()} tasks.
            </p>
          ) : (
            tasks.map((task) => <TaskRow key={task.id} task={task} now={now} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({ task, now }: { task: MyWorkTask; now: Date; }) {
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
