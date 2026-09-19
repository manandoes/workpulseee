import {
  ClipboardCheck,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "cn";
import { Section, SectionHeading } from "@/components/marketing/section";

/**
 * The seven core modules listed in PRD.md section 6.0, staged as an
 * asymmetric roster of cards rather than seven identical icon-heading-text
 * tiles: the two modules that make the product's live workload number
 * possible — Workload intelligence and Performance tracking — are the
 * "starters", sized and detailed accordingly; the rest are the bench,
 * smaller but no less real.
 */
const STARTERS = [
  {
    icon: Gauge,
    title: "Workload intelligence",
    description:
      "A live per-person workload percentage computed from active tasks, effort, and deadlines against your company's weekly capacity.",
    detail: { label: "Team average", percent: 64, tone: "warning" as const },
  },
  {
    icon: TrendingUp,
    title: "Performance tracking",
    description:
      "Continuous scoring from delivery, goals, and manager feedback — updated as work moves, not once a year.",
    detail: { label: "Delivery on-time", percent: 88, tone: "success" as const },
  },
] as const;

const BENCH = [
  {
    icon: LayoutDashboard,
    title: "Company dashboard",
    description: "Live counts, overdue work, pending approvals, and early warnings on one screen.",
  },
  {
    icon: Users,
    title: "Employee management",
    description: "Profiles, departments, reporting lines, and role-based access for admins and HR.",
  },
  {
    icon: FolderKanban,
    title: "Task & project management",
    description: "Projects, tasks, deadlines, and priorities in board, list, or calendar views.",
  },
  {
    icon: ClipboardCheck,
    title: "Employee requests",
    description: "Leave, reimbursements, equipment, and WFH requests with a clear approval trail.",
  },
  {
    icon: Wallet,
    title: "Client financials",
    description: "Project value, cost, and margin per client, rolled up across the agency.",
  },
] as const;

const TONE_FILL = { success: "bg-success", warning: "bg-warning" } as const;
const TONE_TEXT = { success: "text-success-text", warning: "text-warning-text" } as const;

export function FeaturesSection() {
  return (
    <Section id="features" className="bg-surface">
      <SectionHeading
        title="Everything your agency runs on, in one place"
        description="Stop stitching together spreadsheets, a project tool, and a chat thread for approvals."
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-2">
        {STARTERS.map((feature) => (
          <div
            key={feature.title}
            className="border-brand-brown bg-background flex flex-col gap-4 rounded-lg border-2 p-7"
          >
            <feature.icon aria-hidden className="text-brand-brown size-7" strokeWidth={1.5} />
            <h3 className="text-brand-brown text-2xl font-bold tracking-tight">
              {feature.title}
            </h3>
            <p className="text-text-secondary text-pretty">{feature.description}</p>

            <div className="mt-auto flex flex-col gap-1.5 pt-3">
              <span aria-hidden className="bg-surface-muted h-2 w-full overflow-hidden rounded-full">
                <span
                  className={cn("block h-full rounded-full", TONE_FILL[feature.detail.tone])}
                  style={{ width: `${feature.detail.percent}%` }}
                />
              </span>
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-text-secondary">{feature.detail.label}</span>
                <span className={cn("font-bold tabular-nums", TONE_TEXT[feature.detail.tone])}>
                  {feature.detail.percent}%
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENCH.map((feature) => (
          <li
            key={feature.title}
            className="border-brand-brown-light bg-background flex flex-col gap-3 rounded-lg border-2 p-5"
          >
            <feature.icon aria-hidden className="text-brand-brown-soft size-5" strokeWidth={1.5} />
            <h3 className="text-brand-brown text-lg font-bold tracking-tight">
              {feature.title}
            </h3>
            <p className="text-text-secondary">{feature.description}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
