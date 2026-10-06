"use client";

import type { MyWorkTask } from "@/lib/my-work-data";
import { useState } from "react";
import { WorkloadDetailDialog } from "@/components/my-space/workload-detail-dialog";
import { TasksDialog } from "@/components/my-space/tasks-dialog";
import { ProjectsDialog } from "@/components/my-space/projects-dialog";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { WorkloadBar } from "@/components/dashboard/workload-bar";

/**
 * Client wrapper for My Work stats — makes the three stat boxes interactive.
 * Renders the workload bar and two MetricTile click targets alongside the
 * dialogs they open.
 */
export function MyWorkStats({
  tasks,
  projects,
  workloadPercent,
  now,
}: {
  tasks: MyWorkTask[];
  projects: { id: string; name: string; status: string; client: { name: string } }[];
  workloadPercent: number | null;
  now: Date;
}) {
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          onClick={() => setWorkloadOpen(true)}
          className="cursor-pointer rounded-lg border border-border transition-colors hover:bg-surface-muted"
        >
          <div className="flex flex-col gap-1 py-2 px-4">
            <p className="text-text-secondary text-meta">Workload</p>
            <WorkloadBar percent={workloadPercent} />
          </div>
        </div>
        <MetricTile
          label="Open tasks"
          value={String(tasks.length)}
          onClick={() => setTasksOpen(true)}
        />
        <MetricTile
          label="Current projects"
          value={String(projects.length)}
          onClick={() => setProjectsOpen(true)}
        />
      </div>

      <WorkloadDetailDialog
        open={workloadOpen}
        onOpenChange={setWorkloadOpen}
        tasks={tasks}
        workloadPercent={workloadPercent}
        now={now}
      />
      <TasksDialog
        open={tasksOpen}
        onOpenChange={setTasksOpen}
        bucket="inProgress"
        tasks={tasks.filter((t) => t.status === "InProgress")}
        now={now}
      />
      <ProjectsDialog
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        projects={projects}
      />
    </>
  );
}
