import { formatDateTime, formatDuration, humanizeEnum } from "@/lib/format";
import { totalTrackedMs, type TimeEntry } from "@/lib/task-timer";

export type TaskTimeLogRow = TimeEntry & {
  id: string;
  endReason: string | null;
  employee: { id: string; fullName: string };
};

/**
 * A task's time record (Phase 12 — task time tracking) — every stretch anyone worked on
 * it, and the total.
 *
 * Shown with the task's details rather than on a reporting page of its own:
 * the question this answers is "how long did *this* take, and who did it",
 * which is a fact about the task. The same shape as
 * `components/attendance/attendance-table.tsx`, one level down.
 *
 * The reason column is what makes the log readable after the fact: it is how a
 * break reads differently from a task that was put down for something more
 * urgent, and how time closed automatically at sign-out is visible as such.
 */
export function TaskTimeLog({
  entries,
  now,
}: {
  entries: TaskTimeLogRow[];
  /** Passed in rather than read with `new Date()` so a still-running row's
   * duration is stable for the lifetime of one server render. */
  now: Date;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-text-secondary">
        No time tracked on this task yet. Its assignee starts the timer from My
        Work.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground">
        <span className="text-text-secondary text-meta">Total tracked · </span>
        <span className="font-medium">
          {formatDuration(totalTrackedMs(entries, now))}
        </span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-muted">
            <tr className="text-text-secondary text-meta">
              <th className="rounded-l-lg px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Stopped</th>
              <th className="px-3 py-2 font-medium">Duration</th>
              <th className="rounded-r-lg px-3 py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-border border-b">
                <td className="px-3 py-3">{entry.employee.fullName}</td>
                <td className="px-3 py-3">{formatDateTime(entry.startedAt)}</td>
                <td className="text-text-secondary px-3 py-3">
                  {entry.endedAt
                    ? formatDateTime(entry.endedAt)
                    : "Still running"}
                </td>
                <td className="text-text-secondary px-3 py-3">
                  {formatDuration(
                    (entry.endedAt ?? now).getTime() - entry.startedAt.getTime()
                  )}
                </td>
                <td className="text-text-secondary px-3 py-3">
                  {entry.endReason ? humanizeEnum(entry.endReason) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
