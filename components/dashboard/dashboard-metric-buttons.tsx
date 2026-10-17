"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardMetrics } from "@/lib/alert-data";
import type { SessionActor } from "@/lib/permissions";
import { MetricTile } from "./metric-tile";
import { formatMoney, formatDate } from "@/lib/format";
import { performanceBandLabel } from "@/lib/performance";
import { isOverdue } from "@/lib/tasks";

// ---------------------------------------------------------------------------
// Tile definition
// ---------------------------------------------------------------------------

type PreviewKind =
  | "none"
  | "employees"
  | "requests"
  | "reimbursements"
  | "projects"
  | "tasks"
  | "performance";

interface TileDef {
  id: string;
  label: string;
  value: string;
  sublabel?: string;
  href: string | null;
  previewKind: PreviewKind;
}

// ---------------------------------------------------------------------------
// Preview content renderers
// ---------------------------------------------------------------------------

function EmployeePreview({
  employees,
}: {
  employees: { fullName: string; workloadPercent: number | null; jobRole: string | null }[];
}) {
  if (employees.length === 0) {
    return <p className="text-text-secondary text-sm">No active employees.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {employees.map((e) => (
        <div
          key={e.fullName}
          className="flex items-center justify-between text-sm"
        >
          <span className="font-medium text-brand-brown">{e.fullName}</span>
          <span className="text-text-secondary">
            {e.jobRole ?? "—"}
            {e.workloadPercent != null
              ? ` · ${Math.round(Number(e.workloadPercent))}% workload`
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function RequestPreview({
  requests,
}: {
  requests: {
    id: string;
    subject: string;
    type: string;
    createdAt: Date;
    employeeName: string | null;
  }[];
}) {
  if (requests.length === 0) {
    return <p className="text-text-secondary text-sm">No pending requests.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-start justify-between gap-2 text-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-brand-brown">{r.subject}</span>
            <span className="text-text-secondary">
              {r.type} · by {r.employeeName ?? "—"}
            </span>
          </div>
          <span className="text-text-secondary text-meta shrink-0">
            {formatDate(r.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReimbursementPreview({
  requests,
  currency,
}: {
  requests: {
    id: string;
    subject: string;
    amount: number;
    createdAt: Date;
    employeeName: string | null;
  }[];
  currency: string;
}) {
  if (requests.length === 0) {
    return (
      <p className="text-text-secondary text-sm">No pending reimbursements.</p>
    );
  }
  const total = requests.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between text-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-brand-brown">{r.subject}</span>
            <span className="text-text-secondary">
              by {r.employeeName ?? "—"} · {formatDate(r.createdAt)}
            </span>
          </div>
          <span className="font-semibold text-brand-brown">
            {formatMoney(r.amount, currency)}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-border pt-2 text-sm">
        <span className="text-text-secondary">Total: </span>
        <span className="font-semibold text-brand-brown">
          {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}

function ProjectPreview({
  projects,
}: {
  projects: {
    name: string;
    code: string | null;
    dueDate: Date | null;
    clientName: string | null;
  }[];
}) {
  if (projects.length === 0) {
    return <p className="text-text-secondary text-sm">No active projects.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {projects.map((p) => (
        <div key={p.name} className="text-sm">
          <span className="font-medium text-brand-brown">{p.name}</span>
          {p.code ? (
            <span className="text-text-secondary text-meta"> ({p.code})</span>
          ) : null}
          <span className="text-text-secondary text-meta block">
            {p.clientName ?? "—"}
            {p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function TaskPreview({
  tasks,
  now,
}: {
  tasks: {
    id: string;
    title: string;
    status: string;
    dueDate: Date | null;
    priority: string | null;
    assigneeName: string | null;
    projectName: string | null;
  }[];
  now: Date;
}) {
  const overdue = tasks.filter(
    (t) => isOverdue({ status: t.status as any, dueDate: t.dueDate }, now) && t.status !== "Done"
  );
  const done = tasks.filter((t) => t.status === "Done").length;
  const inProgress = tasks.filter((t) => t.status === "InProgress").length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-text-secondary text-meta mb-1">
          Total tracked: {tasks.length}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Card>
            <CardContent className="py-1.5">
              <p className="text-h3 font-semibold text-warning">{overdue.length}</p>
              <p className="text-meta text-text-secondary">Overdue</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-1.5">
              <p className="text-h3 font-semibold text-success">{done}</p>
              <p className="text-meta text-text-secondary">Done</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-1.5">
              <p className="text-h3 font-semibold text-brand-brown">{inProgress}</p>
              <p className="text-meta text-text-secondary">In Progress</p>
            </CardContent>
          </Card>
        </div>
      </div>
      {overdue.length > 0 && (
        <div>
          <p className="text-sm font-medium text-warning mb-1">Overdue</p>
          <div className="flex flex-col gap-1">
            {overdue.slice(0, 5).map((t) => (
              <div key={t.id} className="text-sm">
                <span className="font-medium text-brand-brown">{t.title}</span>
                <span className="text-text-secondary text-meta block">
                  {t.projectName ?? "Personal"} · {t.assigneeName ?? "Unassigned"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PerformancePreview({
  snapshot,
  topScores,
}: {
  snapshot: { averageScore: number; band: string } | null;
  topScores: { employeeName: string | null; score: number }[];
}) {
  if (snapshot == null) {
    return (
      <p className="text-text-secondary text-sm">
        Not enough data yet. Scores appear once tasks and feedback are recorded.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="py-2 text-center">
            <p className="text-h2 font-semibold text-brand-brown">
              {snapshot.averageScore.toFixed(1)}
            </p>
            <p className="text-meta text-text-secondary">Average Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 text-center">
            <p className="text-h2 font-semibold text-brand-brown">{snapshot.band}</p>
            <p className="text-meta text-text-secondary">Band</p>
          </CardContent>
        </Card>
      </div>
      {topScores.length > 0 && (
        <div>
          <p className="text-sm font-medium text-brand-brown mb-1">Top scores</p>
          <div className="flex flex-col gap-1">
            {topScores.slice(0, 5).map((rec, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium text-brand-brown">
                  {rec.employeeName ?? "—"}
                </span>
                <span className="text-text-secondary">{rec.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One clickable tile with its own dialog
// ---------------------------------------------------------------------------

function ClickableTile({
  def,
  actor,
  currency,
  now,
}: {
  def: TileDef;
  actor: SessionActor;
  currency: string;
  now: Date;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-kind data state
  const [employees, setEmployees] = useState<
    { fullName: string; workloadPercent: number | null; jobRole: string | null }[]
  >([]);
  const [requests, setRequests] = useState<
    { id: string; subject: string; type: string; createdAt: Date; employeeName: string | null }[]
  >([]);
  const [reimbursements, setReimbursements] = useState<
    { id: string; subject: string; amount: number; createdAt: Date; employeeName: string | null }[]
  >([]);
  const [projects, setProjects] = useState<
    { name: string; code: string | null; dueDate: Date | null; clientName: string | null }[]
  >([]);
  const [tasks, setTasks] = useState<
    { id: string; title: string; status: string; dueDate: Date | null; priority: string | null; assigneeName: string | null; projectName: string | null }[]
  >([]);
  const [perfSnapshot, setPerfSnapshot] = useState<{ averageScore: number; band: string } | null>(null);
  const [topScores, setTopScores] = useState<{ employeeName: string | null; score: number }[]>([]);

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard-preview?kind=${encodeURIComponent(def.previewKind)}&companyId=${encodeURIComponent(actor.companyId)}&role=${encodeURIComponent(actor.role)}&accountId=${encodeURIComponent(actor.id)}`
      );
      if (!res.ok) throw new Error("Failed to load preview");
      const data = await res.json();
      if (data.kind === "employees") setEmployees(data.employees ?? []);
      else if (data.kind === "requests") setRequests(data.requests ?? []);
      else if (data.kind === "reimbursements") setReimbursements(data.reimbursements ?? []);
      else if (data.kind === "projects") setProjects(data.projects ?? []);
      else if (data.kind === "tasks") setTasks(data.tasks ?? []);
      else if (data.kind === "performance") {
        setPerfSnapshot(data.snapshot ?? null);
        setTopScores(data.topScores ?? []);
      }
    } catch {
      setError("Failed to load preview data.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset per-tile data on close
      setEmployees([]);
      setRequests([]);
      setReimbursements([]);
      setProjects([]);
      setTasks([]);
      setPerfSnapshot(null);
      setTopScores([]);
      setError(null);
    }
  };

  let previewContent: React.ReactNode = null;
  if (loading) {
    previewContent = <p className="text-text-secondary text-sm py-4 text-center">Loading…</p>;
  } else if (error) {
    previewContent = <p className="text-danger text-sm py-4">{error}</p>;
  } else if (def.previewKind === "employees") {
    previewContent = <EmployeePreview employees={employees} />;
  } else if (def.previewKind === "requests") {
    previewContent = <RequestPreview requests={requests} />;
  } else if (def.previewKind === "reimbursements") {
    previewContent = <ReimbursementPreview requests={reimbursements} currency={currency} />;
  } else if (def.previewKind === "projects") {
    previewContent = <ProjectPreview projects={projects} />;
  } else if (def.previewKind === "tasks") {
    previewContent = <TaskPreview tasks={tasks} now={now} />;
  } else if (def.previewKind === "performance") {
    previewContent = <PerformancePreview snapshot={perfSnapshot} topScores={topScores} />;
  }

  return (
    <>
      {def.href ? (
        <Link href={def.href}>
          <MetricTile
            label={def.label}
            value={def.value}
            sublabel={def.sublabel}
            onClick={handleOpen}
            className="hover:shadow-sm"
          />
        </Link>
      ) : (
        <MetricTile
          label={def.label}
          value={def.value}
          sublabel={def.sublabel}
          onClick={handleOpen}
          className="hover:shadow-sm"
        />
      )}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{def.label}</DialogTitle>
          </DialogHeader>
          {previewContent}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tile definitions by mode
// ---------------------------------------------------------------------------

function getTiles(actor: SessionActor, metrics: DashboardMetrics): TileDef[] {
  const isHR = actor.role === "HRHead" || actor.role === "HRTeam";

  if (isHR) {
    return [
      {
        id: "active-employees",
        label: "Active employees",
        value: String(metrics.activeEmployees),
        href: "/employees",
        previewKind: "employees",
      },
      {
        id: "pending-approvals",
        label: "Pending approvals",
        value: String(metrics.pendingApprovalsCount),
        href: "/requests",
        previewKind: "requests",
      },
      {
        id: "reimbursements-pending",
        label: "Reimbursements pending",
        value: formatMoney(metrics.reimbursementSummary.total, "INR"),
        sublabel: `${metrics.reimbursementSummary.count} request${metrics.reimbursementSummary.count === 1 ? "" : "s"}`,
        href: "/requests?type=Reimbursement",
        previewKind: "reimbursements",
      },
    ];
  }

  if (!metrics.delivery) return [];

  return [
    {
      id: "active-projects",
      label: "Active projects",
      value: String(metrics.delivery.activeProjects),
      href: "/projects?status=Active",
      previewKind: "projects",
    },
    {
      id: "task-completion",
      label: "Task completion",
      value:
        metrics.delivery.taskCompletionPercent != null
          ? `${Math.round(metrics.delivery.taskCompletionPercent)}%`
          : "—",
      href: "/tasks",
      previewKind: "tasks",
    },
    {
      id: "overdue-tasks",
      label: "Overdue tasks",
      value: String(metrics.delivery.overdueTasksCount),
      href: "/tasks?due=overdue",
      previewKind: "tasks",
    },
    {
      id: "performance-snapshot",
      label: "Performance snapshot",
      value:
        metrics.delivery.performanceSnapshot != null
          ? metrics.delivery.performanceSnapshot.averageScore.toFixed(1)
          : "—",
      sublabel:
        metrics.delivery.performanceSnapshot != null
          ? performanceBandLabel(metrics.delivery.performanceSnapshot.band)
          : "Not enough data yet",
      href: "/performance",
      previewKind: "performance",
    },
  ];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardMetricButtons({
  actor,
  metrics,
  currency,
  now,
}: {
  actor: SessionActor;
  metrics: DashboardMetrics;
  currency: string;
  now: Date;
}) {
  const tiles = getTiles(actor, metrics);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <ClickableTile
          key={tile.id}
          def={tile}
          actor={actor}
          currency={currency}
          now={now}
        />
      ))}
    </div>
  );
}
