import { cn } from "cn";
import type { TasksBreakdown } from "@/lib/performance-breakdown";

/**
 * Where a person's allotted tasks stand for the chosen period — the task
 * delivery half of `BreakdownTiles` given its own section, so a manager can
 * read allotted / done / delayed / not done at a glance rather than
 * reconstructing them from rates.
 *
 * The bar partitions `allotted` exactly (done on time + done late + in
 * progress + not started); "Delayed" is an overlay on the open half — open
 * work already past its due date — so it is listed beside the bar, not in it.
 * Every segment is labelled with its count (Design.md § 10 — color never
 * carries meaning alone).
 */
export function TaskBreakdownPanel({ tasks }: { tasks: TasksBreakdown }) {
  const notDone = tasks.notStarted + tasks.inProgress;

  const segments = [
    { label: "Done on time", count: tasks.completedOnTime, className: "bg-success" },
    { label: "Done late", count: tasks.completedLate, className: "bg-warning" },
    { label: "In progress", count: tasks.inProgress, className: "bg-info" },
    { label: "Not started", count: tasks.notStarted, className: "bg-brand-brown-light" },
  ];

  const stats = [
    { label: "Allotted", value: tasks.allotted },
    { label: "Done", value: tasks.completed },
    { label: "Not done", value: notDone },
    {
      label: "Delayed",
      value: tasks.delayed,
      hint: "Open and past due",
      className: tasks.delayed > 0 ? "text-danger-text" : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <dt className="text-text-secondary text-meta">{stat.label}</dt>
            <dd className={cn("text-h1 text-brand-brown font-semibold", stat.className)}>
              {stat.value}
            </dd>
            {stat.hint ? (
              <dd className="text-text-secondary text-meta">{stat.hint}</dd>
            ) : null}
          </div>
        ))}
      </dl>

      {tasks.allotted === 0 ? (
        <p className="text-text-secondary text-meta">
          No tasks allotted in this period.
        </p>
      ) : (
        <>
          <div
            className="bg-surface-muted flex h-3 w-full overflow-hidden rounded-full"
            role="img"
            aria-label={segments
              .map((segment) => `${segment.label}: ${segment.count}`)
              .join(", ")}
          >
            {segments.map((segment) =>
              segment.count > 0 ? (
                <div
                  key={segment.label}
                  className={segment.className}
                  style={{ width: `${(segment.count / tasks.allotted) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {segments.map((segment) => (
              <li
                key={segment.label}
                className="text-text-secondary text-meta flex items-center gap-1.5"
              >
                <span aria-hidden className={cn("size-2.5 rounded-full", segment.className)} />
                {segment.label}
                <span className="text-foreground font-medium">{segment.count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
