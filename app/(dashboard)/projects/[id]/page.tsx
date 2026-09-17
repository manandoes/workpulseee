import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { margin, marginPercent } from "@/lib/projects";
import { completionPercent, taskFilter, TASK_STATUSES } from "@/lib/tasks";
import { loadCurrency, loadTeamCandidates } from "@/lib/project-data";
import {
  canManageProject,
  canViewProjects,
  canViewTasks,
} from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectStatusBadge } from "@/components/projects/status-badge";
import { ProjectTeam } from "@/components/projects/project-team";
import { OverdueBadge, taskStatusLabel } from "@/components/tasks/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Project — WorkPulse" };

/**
 * Project detail (Phases.md Phase 4).
 *
 * Shows the project, its financials and its team, and is where a team is
 * assigned — adding someone is a single action rather than a form save.
 */
export default async function ProjectPage({
  params,
}: PageProps<"/projects/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewProjects(actor)) redirect("/dashboard");

  const { id } = await params;

  const project = await db.project.findFirst({
    // Tenant scoping (Rules.md section 2): an id from another company reads as
    // "not found" rather than revealing that the record exists.
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      status: true,
      startDate: true,
      dueDate: true,
      value: true,
      estimatedCost: true,
      createdAt: true,
      leadAccountId: true,
      client: { select: { id: true, name: true, status: true } },
      leadAccount: { select: { fullName: true, role: true } },
      members: {
        orderBy: { employee: { fullName: "asc" } },
        select: {
          employee: {
            select: {
              id: true,
              fullName: true,
              jobRole: true,
              status: true,
              department: { select: { name: true } },
              workloadPercent: true,
            },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const mayManage = canManageProject(actor, project);
  const now = new Date();

  const [currency, candidates, taskCounts, overdueCount] = await Promise.all([
    loadCurrency(actor),
    // Only fetched when it can be used — the picker is not rendered otherwise.
    mayManage ? loadTeamCandidates(actor, project.id) : Promise.resolve([]),
    /**
     * Progress is counted in the database rather than by loading the tasks:
     * this page shows totals, and a project with a thousand tasks should cost
     * the same as one with ten.
     */
    db.task.groupBy({
      by: ["status"],
      where: scopedWhere(actor, { projectId: project.id }),
      _count: { _all: true },
    }),
    db.task.count({
      // The same overdue rule the task list uses, so the two always agree.
      where: scopedWhere(actor, {
        projectId: project.id,
        ...taskFilter({ due: "overdue" }, now),
      }),
    }),
  ]);

  const countFor = (status: (typeof TASK_STATUSES)[number]) =>
    taskCounts.find((row) => row.status === status)?._count._all ?? 0;

  const totalTasks = taskCounts.reduce((sum, row) => sum + row._count._all, 0);
  const progress = completionPercent(totalTasks, countFor("Done"));

  const profit = margin(project.value, project.estimatedCost);

  return (
    <>
      <Link
        href="/projects"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Back to projects
      </Link>

      <PageHeader
        title={project.name}
        description={
          <>
            {project.code ? `${project.code} · ` : ""}
            <Link
              href={`/projects/clients/${project.client.id}`}
              className="underline-offset-4 hover:underline"
            >
              {project.client.name}
            </Link>
          </>
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ProjectStatusBadge status={project.status} />
            {mayManage ? (
              <Button asChild variant="outline">
                <Link href={`/projects/${project.id}/edit`}>
                  <Pencil aria-hidden />
                  Edit project
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Overview">
          <Detail label="Client" value={project.client.name} />
          <Detail
            label="Lead"
            value={
              project.leadAccount
                ? `${project.leadAccount.fullName} (${project.leadAccount.role})`
                : "No lead"
            }
          />
          <Detail label="Start date" value={formatDate(project.startDate)} />
          <Detail label="Due date" value={formatDate(project.dueDate)} />
          <Detail label="Created" value={formatDate(project.createdAt)} />
          <Detail label="Team size" value={`${project.members.length}`} />
        </Panel>

        <Panel
          title="Financials"
          note={`Amounts in ${currency}. Margin is worked out from the two numbers above it and never stored, so it cannot go stale.`}
        >
          <Detail
            label="Project value"
            value={formatMoney(project.value, currency)}
          />
          <Detail
            label="Estimated cost"
            value={formatMoney(project.estimatedCost, currency)}
          />
          <Detail label="Margin" value={formatMoney(profit, currency)} />
          <Detail
            label="Margin %"
            value={formatPercent(
              marginPercent(project.value, project.estimatedCost)
            )}
          />
        </Panel>

        <Panel title="Description" plain>
          {project.description ? (
            <p className="text-foreground whitespace-pre-line">
              {project.description}
            </p>
          ) : (
            <p className="text-text-secondary">No description yet.</p>
          )}
        </Panel>

        <Panel title="Team" plain>
          <ProjectTeam
            projectId={project.id}
            canManage={mayManage}
            candidates={candidates}
            members={project.members.map(({ employee }) => ({
              employeeId: employee.id,
              fullName: employee.fullName,
              jobRole: employee.jobRole,
              departmentName: employee.department?.name ?? null,
              status: employee.status,
              workloadPercent:
                employee.workloadPercent === null
                  ? null
                  : Number(employee.workloadPercent),
            }))}
          />
        </Panel>
      </div>

      {/*
        Tasks (Phases.md Phase 5). HR never reaches this page, but the section
        is still built from the same predicate the tasks pages check, so it can
        never link somewhere the server would refuse.
      */}
      {canViewTasks(actor) ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col gap-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h3 text-brand-brown font-semibold">Tasks</h2>
              <div className="flex flex-wrap items-center gap-2">
                {overdueCount > 0 ? <OverdueBadge /> : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={`/tasks?projectId=${project.id}`}>
                    Open the board
                  </Link>
                </Button>
                {mayManage ? (
                  <Button asChild size="sm">
                    <Link href={`/tasks/new?projectId=${project.id}`}>
                      New task
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            {totalTasks === 0 ? (
              <p className="text-text-secondary">
                No tasks yet. Break the project into tasks to track progress
                here.
              </p>
            ) : (
              <>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Detail label="Tasks" value={`${totalTasks}`} />
                  {TASK_STATUSES.map((status) => (
                    <Detail
                      key={status}
                      label={taskStatusLabel(status)}
                      value={`${countFor(status)}`}
                    />
                  ))}
                  <Detail
                    label="Overdue"
                    value={overdueCount === 0 ? "None" : `${overdueCount}`}
                  />
                </dl>

                <div className="flex flex-col gap-1.5">
                  <p className="text-text-secondary text-meta">
                    {formatPercent(progress)} complete
                  </p>
                  {/*
                    Design.md section 3 keeps the status palette for progress
                    and state; the label above carries the number, so the bar
                    is decoration and hidden from screen readers.
                  */}
                  <div
                    aria-hidden
                    className="bg-surface-muted h-2 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-success h-full rounded-full"
                      style={{ width: `${progress ?? 0}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Panel({
  title,
  note,
  /** Render the body as prose rather than a definition list. */
  plain,
  children,
}: {
  title: string;
  note?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
          {note ? (
            <p className="text-text-secondary text-meta">{note}</p>
          ) : null}
        </div>
        {plain ? (
          children
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-secondary text-meta">{label}</dt>
      <dd className="text-foreground break-words">{value || "—"}</dd>
    </div>
  );
}
