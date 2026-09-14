"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  PERFORMANCE_PERIODS,
  performancePeriodLabel,
  type PerformancePeriodPreset,
} from "@/lib/performance";

/**
 * The period control on a performance page (Phase 13) — all time, this week,
 * this month, or a date range.
 *
 * State lives in the URL rather than in React state, exactly as
 * `components/dashboard/list-filters.tsx` does it: a period is then linkable
 * and reloadable, and the server component does the scoring rather than
 * shipping a second copy of the data to the browser.
 *
 * Not folded into `ListFilters` itself — that component is search-first and
 * every one of its consumers is a directory list. This shares its convention,
 * not its markup.
 */
export function PeriodFilter({
  basePath,
  period,
  from,
  to,
}: {
  basePath: string;
  period: PerformancePeriodPreset;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function apply(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams);

    for (const [name, value] of Object.entries(changes)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }

    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="period" className="text-brand-brown font-medium">
          Period
        </Label>
        <select
          id="period"
          name="period"
          value={period}
          onChange={(event) =>
            // Leaving a custom range drops its dates, so the URL never carries
            // a range that nothing is reading.
            apply(
              event.target.value === "custom"
                ? { period: event.target.value }
                : { period: event.target.value, from: "", to: "" }
            )
          }
          className="border-input bg-surface text-foreground h-9 rounded-lg border px-3"
        >
          {PERFORMANCE_PERIODS.map((option) => (
            <option key={option} value={option}>
              {performancePeriodLabel(option)}
            </option>
          ))}
        </select>
      </div>

      {period === "custom" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from" className="text-brand-brown font-medium">
              From
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => apply({ from: event.target.value })}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to" className="text-brand-brown font-medium">
              To
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => apply({ to: event.target.value })}
              className="h-9"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
