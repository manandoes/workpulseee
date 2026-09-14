import { formatDateTime, formatDuration } from "@/lib/format";
import { breakDurationMs, netWorkedMs } from "@/lib/attendance";

export type AttendanceTableRow = {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  /** This session's breaks (Plan.md Phase 15). Empty for a session with none. */
  breaks: { startedAt: Date; endedAt: Date | null }[];
};

/**
 * A simple session history table, shared by the employee's own "records"
 * list on My Work and the admin-facing Attendance panel on an employee's
 * profile page — same shape, same columns, two callers.
 *
 * Shows net worked time with any break called out beside it (Plan.md Phase
 * 15's display decision), rather than one figure that quietly includes lunch.
 */
export function AttendanceTable({
  records,
  now,
}: {
  records: AttendanceTableRow[];
  /** Passed in rather than read with `new Date()` so a still-open row's
   * duration is stable for the lifetime of one server render. */
  now: Date;
}) {
  if (records.length === 0) {
    return <p className="text-text-secondary">No attendance recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-surface-muted">
          <tr className="text-text-secondary text-meta">
            <th className="rounded-l-lg px-3 py-2 font-medium">Logged in</th>
            <th className="px-3 py-2 font-medium">Logged out</th>
            <th className="px-3 py-2 font-medium">Worked</th>
            <th className="rounded-r-lg px-3 py-2 font-medium">Break</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const sessions = [record];
            const breakMs = breakDurationMs(record.breaks, now);
            const workedMs = netWorkedMs(sessions, record.breaks, now);

            return (
              <tr key={record.id} className="border-border border-b">
                <td className="px-3 py-3">
                  {formatDateTime(record.clockInAt)}
                </td>
                <td className="text-text-secondary px-3 py-3">
                  {record.clockOutAt
                    ? formatDateTime(record.clockOutAt)
                    : "Still logged in"}
                </td>
                <td className="text-text-secondary px-3 py-3">
                  {formatDuration(workedMs)}
                </td>
                <td className="text-text-secondary px-3 py-3">
                  {breakMs > 0 ? formatDuration(breakMs) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
