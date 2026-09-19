import { formatDuration, formatPercent } from "@/lib/format";
import type { PerformanceBreakdown } from "@/lib/performance-breakdown";
import { MetricTile } from "@/components/dashboard/metric-tile";

/**
 * The parameters that make up a performance score (PRD.md section 6.5)
 * alongside the blended figure `PeriodScore` already shows above this —
 * attendance, breaks, focus, and task delivery, each as its own tile rather
 * than folded into one number — plus a few display-only extras (break
 * ratio, turnaround, projects) that report on the same data without
 * changing what the score itself means.
 */
export function BreakdownTiles({
  breakdown,
}: {
  breakdown: PerformanceBreakdown;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricTile
        label="Attendance"
        value={formatDuration(breakdown.attendance.workedMs)}
        sublabel={`${breakdown.attendance.sessionCount} session${breakdown.attendance.sessionCount === 1 ? "" : "s"}`}
      />
      <MetricTile
        label="Focus time"
        value={formatDuration(breakdown.focus.trackedMs)}
        sublabel="Tracked on tasks"
      />
      <MetricTile
        label="Breaks"
        value={formatDuration(breakdown.breaks.totalMs)}
        sublabel={`${breakdown.breaks.count} break${breakdown.breaks.count === 1 ? "" : "s"}`}
      />
      <MetricTile
        label="Break ratio"
        value={formatPercent(breakdown.breaks.ratioPercent)}
        sublabel="Of tracked time"
      />
      <MetricTile
        label="Tasks"
        value={`${breakdown.tasks.completed} done`}
        sublabel={`${breakdown.tasks.delayed} of ${breakdown.tasks.due} due tasks delayed`}
      />
      <MetricTile
        label="Completion rate"
        value={formatPercent(breakdown.tasks.completionRate)}
      />
      <MetricTile
        label="On-time rate"
        value={formatPercent(breakdown.tasks.onTimeRate)}
      />
      <MetricTile
        label="Avg. turnaround"
        value={
          breakdown.tasks.avgTurnaroundMs !== null
            ? formatDuration(breakdown.tasks.avgTurnaroundMs)
            : "—"
        }
        sublabel="Task creation to done"
      />
      <MetricTile
        label="Projects"
        value={String(breakdown.projects.distinctProjects)}
        sublabel={`${breakdown.projects.tasksWithProject} task${breakdown.projects.tasksWithProject === 1 ? "" : "s"} tied to a project`}
      />
    </div>
  );
}
