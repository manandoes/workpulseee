import { formatDayKey, formatDuration } from "@/lib/format";
import type { AttendanceDaysBreakdown, DayClassification } from "@/lib/attendance-days";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const CLASSIFICATION_LABEL: Record<DayClassification, string> = {
  full: "Present",
  half: "Half day",
  leave: "Leave",
  wfh: "WFH",
};

const CLASSIFICATION_VARIANT: Record<
  DayClassification,
  "default" | "secondary" | "outline"
> = {
  full: "default",
  half: "outline",
  leave: "secondary",
  wfh: "outline",
};

/**
 * Attendance previewed in days (Performance section) — present/half/leave/
 * WFH day counts as tiles, expandable to the underlying dated list. A sibling
 * to `BreakdownTiles` rather than a change to it: that component is a flat
 * 6-up grid taking only `{ breakdown }`, and folding an expandable element
 * into that layout would fight it rather than extend it.
 *
 * `defaultOpen` expands the detail without a click — used on the printable
 * report pages, which can't be interacted with.
 */
export function DayBreakdownPanel({
  days,
  defaultOpen = false,
}: {
  days: AttendanceDaysBreakdown;
  defaultOpen?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricTile label="Present days" value={String(days.presentDays)} />
        <MetricTile label="Half days" value={String(days.halfDays)} />
        <MetricTile label="Leave days" value={String(days.leaveDays)} />
        <MetricTile label="WFH days" value={String(days.wfhDays)} />
      </div>

      {days.days.length > 0 ? (
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpen ? "days" : undefined}
        >
          <AccordionItem value="days">
            <AccordionTrigger>See the day-by-day breakdown</AccordionTrigger>
            <AccordionContent>
              <ul className="flex flex-col gap-1.5">
                {days.days.map((day) => (
                  <li
                    key={day.dayKey}
                    className="border-border flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0"
                  >
                    <span className="text-foreground">{formatDayKey(day.dayKey)}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant={CLASSIFICATION_VARIANT[day.classification]}>
                        {CLASSIFICATION_LABEL[day.classification]}
                      </Badge>
                      <span className="text-text-secondary text-meta w-16 text-right">
                        {day.sessionCount > 0 ? formatDuration(day.workedMs) : "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}
