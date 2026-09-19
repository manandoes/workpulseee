import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListPlus } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import {
  taskFilter,
  taskVisibilityFilter,
  TASK_ORDER,
  TASK_PRIORITIES,
  TASK_STATUSES,
  UNASSIGNED,
} from "@/lib/tasks";
import {
  loadAssigneeFilterOptions,
  loadTaskClients,
  loadTaskProjects,
} from "@/lib/task-data";
import { canManageTask, canViewTasks } from "@/lib/permissions";
import { paginationMeta, paginationSchema } from "@/lib/pagination";
import { taskFiltersSchema, taskViewSchema } from "@/lib/validations/tasks";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ListFilters } from "@/components/dashboard/list-filters";
import { Pagination } from "@/components/dashboard/pagination";
import { TaskBoard, TaskList } from "@/components/tasks/task-views";
import {
  taskPriorityLabel,
  taskStatusLabel,
} from "@/components/tasks/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export const metadata: Metadata = { title: "Tasks" };

/**
 * Task board and list (Phases.md Phase 5).
 *
 * Search, filters and the chosen view all live in the URL and are applied by
 * the database, so a filtered board can be linked and bookmarked and the page
 * holds no client-side copy of the list.
 *
 * Overdue is computed here from the row rather than read from a column: one
 * `now`, taken once per render, decides it for every task on the page.
 */
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Middleware keeps employees out of the company area; this re-check is what
  // keeps HR out of client delivery (Rules.md section 3).
  if (!canViewTasks(actor)) redirect("/dashboard");

  const query = await searchParams;
  const filters = taskFiltersSchema.parse(query);
  const view = taskViewSchema.parse(query.view) ?? "board";
  const { page: requestedPage } = paginationSchema.parse(query);
  const now = new Date();

  const where = scopedWhere(actor, {
    AND: [taskFilter(filters, now), taskVisibilityFilter(actor)],
  });

  const [projects, clients, assignees, total] = await Promise.all([
    loadTaskProjects(actor),
    loadTaskClients(actor),
    loadAssigneeFilterOptions(actor),
    db.task.count({ where }),
  ]);

  // The list view is row-oriented like every other list page and gets real
  // pagination; the Kanban board doesn't map cleanly onto pages of cards, so
  // it stays unbounded but gains a defensive cap against unbounded growth
  // (Phases.md Phase 12 — "query optimization for larger datasets").
  const meta = view === "list" ? paginationMeta(total, requestedPage) : null;

  const tasks = await db.task.findMany({
    // Tenant scoping (Rules.md section 2) — applied last, so a filter can
    // never widen the query beyond the caller's own company.
    where,
    orderBy: [...TASK_ORDER],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      createdById: true,
      assignee: { select: { id: true, fullName: true } },
      project: { select: { id: true, name: true, leadAccountId: true } },
      client: { select: { id: true, name: true } },
    },
    skip: meta ? meta.skip : 0,
    take: meta ? meta.take : 500,
  });

  /**
   * A project task is governed by its project, so a Manager can move the
   * cards on the boards they lead and only read the rest; a standalone task
   * is personal to whoever raised it. Decided per row rather than once per
   * page, because one board can show several projects (and `taskVisibilityFilter`
   * already keeps someone else's standalone tasks off this page entirely).
   */
  const canManage = (task: {
    project: { leadAccountId: string | null } | null;
    client: { id: string } | null;
    createdById: string | null;
  }) =>
    canManageTask(actor, { ...task, clientId: task.client?.id ?? null });

  const isFiltered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every piece of work across your projects — what stage it is at, who has it, and what has slipped."
        action={
          <Button asChild>
            <Link href="/tasks/new">
              <ListPlus aria-hidden />
              New task
            </Link>
          </Button>
        }
      />

      <ViewToggle current={view} query={query} />

      <ListFilters
        basePath="/tasks"
        searchPlaceholder="Task, description, project or assignee"
        preserve={["view"]}
        selects={[
          {
            name: "projectId",
            label: "Project",
            anyLabel: "All projects",
            options: projects,
          },
          {
            name: "clientId",
            label: "Client",
            anyLabel: "All clients",
            options: clients,
          },
          {
            name: "assigneeId",
            label: "Assignee",
            anyLabel: "Anyone",
            options: [{ value: UNASSIGNED, label: "Unassigned" }, ...assignees],
          },
          {
            name: "status",
            label: "Status",
            anyLabel: "Any status",
            options: TASK_STATUSES.map((status) => ({
              value: status,
              label: taskStatusLabel(status),
            })),
          },
          {
            name: "priority",
            label: "Priority",
            anyLabel: "Any priority",
            options: TASK_PRIORITIES.map((priority) => ({
              value: priority,
              label: taskPriorityLabel(priority),
            })),
          },
          {
            name: "due",
            label: "Deadline",
            anyLabel: "Any deadline",
            options: [
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Due today" },
              { value: "week", label: "Due this week" },
            ],
          },
        ]}
      />

      {tasks.length === 0 ? (
        isFiltered ? (
          <EmptyState
            title="No matches"
            description="No task matches those filters. Try a different search, or clear the filters to see everything."
            action={
              <Button asChild variant="outline">
                <Link href="/tasks">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No tasks yet"
            description="Break a project into tasks, or raise a quick personal one — either way, give it an owner and a deadline and the board fills itself in."
            action={
              <Button asChild>
                <Link href="/tasks/new">Create your first task</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <p className="text-text-secondary text-meta mb-4">
            {total === 1 ? "1 task" : `${total} tasks`}
            {isFiltered ? " matching your filters" : ""}
          </p>

          {view === "board" ? (
            <TaskBoard tasks={tasks} canManage={canManage} now={now} />
          ) : (
            <>
              <TaskList tasks={tasks} canManage={canManage} now={now} />
              {meta ? (
                <Pagination basePath="/tasks" query={query} meta={meta} />
              ) : null}
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * Board or list, as a pair of links rather than a control.
 *
 * Keeping the choice in the URL means the server renders the right view on the
 * first paint, and the filters carry it through with `preserve`.
 */
function ViewToggle({
  current,
  query,
}: {
  current: "board" | "list";
  query: Record<string, string | string[] | undefined>;
}) {
  const href = (view: "board" | "list") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key !== "view" && typeof value === "string" && value) {
        params.set(key, value);
      }
    }
    params.set("view", view);
    return `/tasks?${params.toString()}`;
  };

  return (
    <nav aria-label="Task views" className="mb-6 flex flex-wrap gap-1">
      {(["board", "list"] as const).map((view) => (
        <Link
          key={view}
          href={href(view)}
          aria-current={view === current ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium capitalize transition-colors",
            view === current
              ? "bg-brand-yellow-light text-brand-brown"
              : "text-text-secondary hover:text-brand-brown hover:bg-surface-muted"
          )}
        >
          {view}
        </Link>
      ))}
    </nav>
  );
}
