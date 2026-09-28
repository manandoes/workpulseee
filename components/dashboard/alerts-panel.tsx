import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { DateTime } from "@/components/ui/date-time";
import { StatusPill, type PillStyle } from "@/components/dashboard/status-pill";
import { Card, CardContent } from "@/components/ui/card";

const SEVERITY_STYLES: Record<string, PillStyle> = {
  Critical: {
    text: "text-danger-text",
    dot: "bg-danger",
    label: "Critical",
    description: "Needs attention now",
  },
  Warning: {
    text: "text-warning-text",
    dot: "bg-warning",
    label: "Warning",
    description: "Worth a look",
  },
};

export type AlertRow = {
  id: string;
  severity: string;
  message: string;
  link: string | null;
  createdAt: Date;
};

/**
 * The early-warning exceptions panel (PRD.md section 6.8 — "red/yellow/green
 * alerts"). Critical is the red, Warning the yellow; an empty list is the
 * panel's own green all-clear state (Design.md § 10 — color paired with
 * text, never alone).
 */
export function AlertsPanel({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <Card className="border-success bg-success/10 border">
        <CardContent className="flex items-center gap-2 py-2">
          <CircleCheck aria-hidden className="text-success-text size-5" />
          <p className="text-success-text font-medium">
            All clear — nothing needs attention right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-2">
        <ul className="flex flex-col divide-y divide-(--color-border)">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="flex flex-col gap-1">
                {alert.link ? (
                  <Link
                    href={alert.link}
                    className="text-brand-brown font-medium underline-offset-4 hover:underline"
                  >
                    {alert.message}
                  </Link>
                ) : (
                  <p className="text-brand-brown font-medium">
                    {alert.message}
                  </p>
                )}
                <p className="text-text-secondary text-meta">
                  <DateTime value={alert.createdAt} />
                </p>
              </div>
              <StatusPill
                style={
                  SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.Warning
                }
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
