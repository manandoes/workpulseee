import { scoreDelta } from "@/lib/performance";
import { formatSignedScore } from "@/lib/format";
import type { ScoreHistoryPoint } from "@/components/performance/score-history-chart";

/**
 * How the score moved since it was last computed — the latest
 * `PerformanceRecord` against the one before it (`scoreDelta`,
 * `lib/performance.ts`). Sits next to `PeriodScore`/`ScoreHistoryChart`,
 * which already load the same history for the chart; renders nothing until
 * there are at least two points to compare.
 */
export function ScoreTrend({
  history,
}: {
  /** Oldest first, the same convention `ScoreHistoryChart` uses. */
  history: ScoreHistoryPoint[];
}) {
  const delta = scoreDelta(history);
  if (delta === null) return null;

  return (
    <p className="text-text-secondary text-meta">
      {formatSignedScore(delta)} vs previous score
    </p>
  );
}
