import { formatDuration, formatPercent } from "@/lib/format";
import type { PerformanceBreakdown } from "@/lib/performance-breakdown";
import { MetricTile } from "@/components/dashboard/metric-tile";

/**
 * The four parameters that make up a performance score, shown individually
 * (PRD.md section 6.5) alongside the blended figure `PeriodScore` already
 * shows above this — attendance, breaks, focus, and task delivery, each as
 * its own tile rather than folded into one number.
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
    </div>
  );
}
