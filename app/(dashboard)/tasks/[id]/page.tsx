import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatDateTime } from "@/lib/format";
import { isOverdue, taskVisibilityFilter } from "@/lib/tasks";
import { canManageTask, canViewTasks, isCompanyAdmin } from "@/lib/permissions";
import { loadTaskTimeEntries } from "@/lib/task-timer-data";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  OverdueBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "@/components/tasks/status-badge";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskAttachments } from "@/components/tasks/task-attachments";
import { TaskTimeLog } from "@/components/tasks/task-time-log";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Task — Talking Lens Media" };

/**
 * Task detail (Phases.md Phase 5).
 *
 * Shows the task, moves it through the flow, and is where its conversation,
 * its attachments and its time record live.
 */
export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewTasks(actor)) redirect("/dashboard");

  const { id } = await params;

  const task = await db.task.findFirst({
    // Tenant scoping (Rules.md section 2): an id from another company reads
    // as "not found" rather than revealing that the record exists. A
    // standalone task belonging to someone else reads the same way — it's
    // personal to whoever raised it (`taskVisibilityFilter`).
    where: scopedWhere(actor, { id, ...taskVisibilityFilter(actor) }),
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      estimatedHours: true,
      completedAt: true,
      createdAt: true,
      createdById: true,
      assignee: { select: { id: true, fullName: true, jobRole: true } },
      createdBy: { select: { fullName: true } },
      project: {
        select: {
          id: true,
          name: true,
          leadAccountId: true,
          client: { select: { id: true, name: true } },
        },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorAccountId: true,
          authorAccount: { select: { fullName: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          url: true,
          createdAt: true,
          addedById: true,
          addedBy: { select: { fullName: true } },
        },
      },
    },
  });

  if (!task) notFound();

  // Read after the task, not alongside it: an id that named nothing this
  // viewer can see must not reach a second query at all.
  const timeEntries = await loadTaskTimeEntries(actor, task.id);

  const now = new Date();
  const mayManage = canManageTask(actor, task);
  const late = isOverdue(task, now);

  return (
    <>
      <Link
        href="/tasks"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Back to tasks
      </Link>

      <PageHeader
        title={task.title}
        description={
          task.project ? (
            <>
              <Link
                href={`/projects/${task.project.id}`}
                className="underline-offset-4 hover:underline"
              >
                {task.project.name}
              </Link>
              {" · "}
              <Link
                href={`/projects/clients/${task.project.client.id}`}
                className="underline-offset-4 hover:underline"
              >
                {task.project.client.name}
              </Link>
            </>
          ) : (
            "Personal task"
          )
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            {late ? <OverdueBadge /> : null}
            {mayManage ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/tasks/${task.id}/edit`}>
                    <Pencil aria-hidden />
                    Edit task
                  </Link>
                </Button>
                <DeleteTaskButton taskId={task.id} title={task.title} />
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Overview">
          <Detail
            label="Assignee"
            value={
              task.assignee
                ? task.assignee.jobRole
                  ? `${task.assignee.fullName} — ${task.assignee.jobRole}`
                  : task.assignee.fullName
                : "Unassigned"
            }
          />
          <Detail label="Due date" value={formatDate(task.dueDate)} />
          <Detail
            label="Estimated effort"
            value={
              task.estimatedHours ? `${task.estimatedHours.toString()} h` : "—"
            }
          />
          <Detail
            label="Completed"
            value={
              task.completedAt ? formatDateTime(task.completedAt) : "Not yet"
            }
          />
          <Detail label="Raised by" value={task.createdBy?.fullName ?? "—"} />
          <Detail label="Created" value={formatDate(task.createdAt)} />
        </Panel>

        <Panel
          title="Status"
          note={
            mayManage
              ? "Moving a task to Done records when it was finished; moving it back out clears that."
              : "Only the people who lead this project can move it."
          }
          plain
        >
          {mayManage ? (
            <TaskStatusSelect
              taskId={task.id}
              status={task.status}
              className="max-w-xs"
            />
          ) : (
            <TaskStatusBadge status={task.status} />
          )}
          {late ? (
            <p className="text-danger-text mt-3">
              This task passed its due date on {formatDate(task.dueDate)} and is
              not finished.
            </p>
          ) : null}
        </Panel>

        <Panel title="Description" plain>
          {task.description ? (
            <p className="text-foreground whitespace-pre-line">
              {task.description}
            </p>
          ) : (
            <p className="text-text-secondary">No description yet.</p>
          )}
        </Panel>

        <Panel title="Attachments" plain>
          <TaskAttachments
            taskId={task.id}
            canAttach
            attachments={task.attachments.map((attachment) => ({
              id: attachment.id,
              label: attachment.label,
              url: attachment.url,
              addedByName: attachment.addedBy?.fullName ?? null,
              createdAt: formatDateTime(attachment.createdAt),
              // Whoever added it, or whoever manages the task — the same rule
              // the API enforces.
              canDelete: attachment.addedById === actor.id || mayManage,
            }))}
          />
        </Panel>

        <Panel
          title="Time tracked"
          note="Logged by the assignee from My Work, one stretch per row."
          plain
          className="lg:col-span-2"
        >
          <TaskTimeLog entries={timeEntries} now={now} />
        </Panel>

        <Panel title="Comments" plain className="lg:col-span-2">
          <TaskComments
            taskId={task.id}
            canComment
            comments={task.comments.map((comment) => ({
              id: comment.id,
              body: comment.body,
              createdAt: formatDateTime(comment.createdAt),
              authorName: comment.authorAccount?.fullName ?? null,
              canDelete:
                comment.authorAccountId === actor.id || isCompanyAdmin(actor),
            }))}
          />
        </Panel>
      </div>
    </>
  );
}

function Panel({
  title,
  note,
  /** Render the body as prose rather than a definition list. */
  plain,
  className,
  children,
}: {
  title: string;
  note?: string;
  plain?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
          {note ? (
            <p className="text-text-secondary text-meta">{note}</p>
          ) : null}
        </div>
        {plain ? (
          <div>{children}</div>
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
