import { cn } from "cn";
import { performanceBand, performanceBandLabel } from "@/lib/performance";

/**
 * The performance score visual indicator (Phases.md Phase 8), mirroring
 * `components/dashboard/workload-bar.tsx`'s shape exactly: success/warning/
 * danger by range, the band's word always shown beside the number
 * (Design.md § 10 — color never carries meaning alone).
 */
export function PerformanceScoreBadge({
  score,
  className,
  emptyLabel = "Not yet scored",
}: {
  /** `null` means no `PerformanceRecord` exists yet — not enough data to score. */
  score: number | null;
  className?: string;
  /**
   * What `null` reads as. Defaults to "never scored"; a period view says so in
   * its own terms instead, since nothing in *that window* is a different fact
   * from nothing ever (Phase 13).
   */
  emptyLabel?: string;
}) {
  if (score === null) {
    return (
      <p className={cn("text-text-secondary text-meta", className)}>
        {emptyLabel}
      </p>
    );
  }

  const band = performanceBand(score);
  const text: Record<typeof band, string> = {
    success: "text-success-text",
    warning: "text-warning-text",
    danger: "text-danger-text",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("text-h3 font-semibold", text[band])}>
        {score.toFixed(1)}
      </span>
      <span className="text-text-secondary text-meta">
        {performanceBandLabel(band)}
      </span>
    </div>
  );
}

export { performanceBand, performanceBandLabel } from "@/lib/performance";
