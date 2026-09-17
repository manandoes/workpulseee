import { cn } from "cn";

/**
 * Flat mock of the company dashboard, used as the hero's supporting visual
 * (Design.md section 8 — a clean product mock, never stock photography).
 *
 * The figures are illustrative sample data, labelled as such for screen
 * readers. Workload uses the status palette per Design.md section 3
 * (0-50% success, 51-80% warning, 81%+ danger) - never the brand palette.
 */
const SUMMARY = [
  { label: "Active employees", value: "24" },
  { label: "Active projects", value: "8" },
  { label: "Tasks completed", value: "87%" },
] as const;

const WORKLOAD = [
  { name: "Rahul", percent: 92, tone: "bg-danger", state: "Overloaded" },
  { name: "Priya", percent: 61, tone: "bg-warning", state: "Busy" },
  { name: "Aman", percent: 38, tone: "bg-success", state: "Available" },
] as const;

export function ProductPreview({ className }: { className?: string }) {
  return (
    <figure className={cn("m-0", className)}>
      <div className="border-border bg-surface rounded-xl border p-5 shadow-sm">
        {/*
          The labels below are styled like headings but are not heading
          elements: this is an illustration of the product, not a section of
          this document, and marking it up as h3/h4 would break the page's
          heading order (h1 -> h3) for screen-reader users.
        */}
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-h3 text-brand-brown font-semibold">
            Company dashboard
          </p>
          <span className="text-meta text-text-secondary">This week</span>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {SUMMARY.map((item) => (
            <div
              key={item.label}
              className="bg-surface-muted rounded-lg px-3 py-3"
            >
              <dt className="text-meta text-text-secondary">{item.label}</dt>
              <dd className="text-h2 text-brand-brown mt-1 font-semibold">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5">
          <p className="text-meta text-text-secondary font-medium tracking-wide uppercase">
            Team workload
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {WORKLOAD.map((person) => (
              <li key={person.name} className="flex items-center gap-3">
                <span className="text-brand-brown w-14 shrink-0 font-medium">
                  {person.name}
                </span>
                <span
                  aria-hidden
                  className="bg-surface-muted h-2 flex-1 overflow-hidden rounded-full"
                >
                  <span
                    className={cn("block h-full rounded-full", person.tone)}
                    style={{ width: `${person.percent}%` }}
                  />
                </span>
                {/*
                  Design.md section 10: never rely on colour alone - the bar is
                  always paired with the number and a text state.
                */}
                <span className="text-brand-brown w-24 shrink-0 text-right tabular-nums">
                  {person.percent}%
                  <span className="text-text-secondary text-meta ml-1">
                    {person.state}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="sr-only">
        Illustrative preview of the WorkPulse company dashboard, showing sample
        headline counts and per-employee workload.
      </figcaption>
    </figure>
  );
}
