import { formatDate } from "@/lib/format";
import type { Period } from "@/lib/performance";
import { PerformanceScoreBadge } from "@/components/performance/score-badge";

/**
 * The score for the selected window, with a line saying what that window
 * covers (Phase 13).
 *
 * The caption is not decoration: a period score is computed from different
 * inputs than an all-time one — workload drops out, because it is a live
 * figure with no history — and a number whose basis changed silently under a
 * filter would be worse than no filter at all.
 */
export function PeriodScore({
  score,
  period,
}: {
  score: number | null;
  /** `null` is all time — the whole record. */
  period: Period | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <PerformanceScoreBadge
        score={score}
        emptyLabel={
          period
            ? "Nothing to score in this period"
            : "Not yet scored"
        }
      />
      <p className="text-text-secondary text-meta">
        {period
          ? `Work completed or falling due between ${formatDate(period.from)} and ${formatDate(period.to)}, plus feedback and goals decided in it. Workload is left out of a period score.`
          : "Across the whole record, including current workload."}
      </p>
    </div>
  );
}
