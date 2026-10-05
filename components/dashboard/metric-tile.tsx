import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One aggregate stat tile (Phases.md Phase 9 — "real-time counts"), reused
 * for every count/percentage on the dashboard.
 */
export function MetricTile({
  label,
  value,
  sublabel,
  onClick,
  id,
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  /** When provided, makes the tile interactive (e.g. opens a dialog or navigates). */
  onClick?: () => void;
  id?: string;
  className?: string;
}) {
  const interactive = typeof onClick === "function";
  return (
    <Card
      id={id}
      onClick={onClick}
      className={cn(
        interactive && "cursor-pointer transition-colors hover:bg-surface-muted",
        className
      )}
    >
      <CardContent className="flex flex-col gap-1 py-2">
        <p className="text-text-secondary text-meta">{label}</p>
        <p className="text-h1 text-brand-brown font-semibold">{value}</p>
        {sublabel ? (
          <p className="text-text-secondary text-meta">{sublabel}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
