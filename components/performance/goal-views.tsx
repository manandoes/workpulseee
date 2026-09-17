import type { GoalStatus } from "@/lib/generated/prisma/enums";
import type { PerformanceSubject } from "@/lib/performance-data";
import { formatDate } from "@/lib/format";
import { GoalStatusBadge } from "@/components/performance/goal-status-badge";
import { GoalDecisionActions } from "@/components/performance/goal-decision-actions";

export type GoalSummary = {
  id: string;
  title: string;
  description: string | null;
  targetDate: Date | null;
  status: GoalStatus;
  createdAt: Date;
  createdBy: { fullName: string } | null;
};

/**
 * An employee's goals (Phases.md Phase 8). Shared by the manager's
 * performance detail page and the employee's own My Growth — `mayDecide`
 * gates the Achieve/Miss actions, since goals are manager-owned.
 */
export function GoalList({
  subject,
  goals,
  mayDecide,
}: {
  subject: PerformanceSubject;
  goals: GoalSummary[];
  mayDecide: boolean;
}) {
  if (goals.length === 0) {
    return <p className="text-text-secondary">No goals set yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-(--color-border)">
      {goals.map((goal) => (
        <li key={goal.id} className="flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-brand-brown font-medium">{goal.title}</p>
              {goal.description ? (
                <p className="text-text-secondary text-meta">
                  {goal.description}
                </p>
              ) : null}
            </div>
            <GoalStatusBadge status={goal.status} />
          </div>
          <p className="text-text-secondary text-meta">
            {goal.targetDate ? `Target: ${formatDate(goal.targetDate)} · ` : ""}
            Set by {goal.createdBy?.fullName ?? "a former team member"} on{" "}
            {formatDate(goal.createdAt)}
          </p>
          {mayDecide && goal.status === "Active" ? (
            <GoalDecisionActions subject={subject} goalId={goal.id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
