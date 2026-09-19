import { cn } from "cn";

/**
 * The hero's supporting visual (Design.md section 8 — a clean product mock,
 * never stock photography), restaged as a roster board rather than a
 * dashboard screenshot: three bordered lineup cards, asymmetric in size, each
 * showing one real product concept — a person, their live workload number,
 * and their status — the way a team sheet shows who's starting and who's on
 * the bench.
 *
 * Illustrative sample data, labelled as such for screen readers. Workload
 * uses the status palette per Design.md section 3 (0-50% success, 51-80%
 * warning, 81%+ danger) — never the brand palette, and colour is never the
 * only signal: every bar carries its number and a text state alongside it.
 */
const ROSTER = [
  { name: "Rahul", role: "Design lead", percent: 92, tone: "danger", state: "Overloaded" },
  { name: "Priya", role: "PM", percent: 61, tone: "warning", state: "Busy" },
  { name: "Aman", role: "Developer", percent: 38, tone: "success", state: "Open" },
] as const;

const TONE_TEXT: Record<(typeof ROSTER)[number]["tone"], string> = {
  danger: "text-danger-text",
  warning: "text-warning-text",
  success: "text-success-text",
};

const TONE_FILL: Record<(typeof ROSTER)[number]["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

function RosterCard({
  person,
  size,
}: {
  person: (typeof ROSTER)[number];
  size: "lg" | "sm";
}) {
  return (
    <div
      className={cn(
        "border-brand-brown bg-surface flex flex-col gap-3 rounded-lg border-2",
        size === "lg" ? "p-6" : "p-4"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-brand-brown font-bold tracking-tight",
              size === "lg" ? "text-2xl" : "text-lg"
            )}
          >
            {person.name}
          </p>
          <p className="text-text-secondary text-sm">{person.role}</p>
        </div>
        <span
          aria-hidden
          className={cn("size-2.5 shrink-0 rounded-full", TONE_FILL[person.tone])}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="bg-surface-muted h-2.5 w-full overflow-hidden rounded-full">
          <span
            className={cn("block h-full rounded-full", TONE_FILL[person.tone])}
            style={{ width: `${person.percent}%` }}
          />
        </span>
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("text-sm font-bold tabular-nums", TONE_TEXT[person.tone])}>
            {person.percent}% workload
          </span>
          <span className={cn("text-xs font-semibold uppercase", TONE_TEXT[person.tone])}>
            {person.state}
          </span>
        </span>
      </div>
    </div>
  );
}

export function RosterCards({ className }: { className?: string }) {
  return (
    <figure className={cn("m-0", className)}>
      <div className="flex flex-col gap-4">
        <RosterCard person={ROSTER[0]} size="lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RosterCard person={ROSTER[1]} size="sm" />
          <RosterCard person={ROSTER[2]} size="sm" />
        </div>
      </div>
      <figcaption className="sr-only">
        Illustrative roster of three team members, each showing a sample live
        workload percentage and status.
      </figcaption>
    </figure>
  );
}
