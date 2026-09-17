import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { toAmountInputValue, toDateInputValue } from "@/lib/format";
import {
  loadAssigneesByProject,
  loadCompanyEmployeeOptions,
  loadTaskClients,
  loadTaskProjects,
} from "@/lib/task-data";
import { canManageTask, canViewTasks } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit task — WorkPulse" };

export default async function EditTaskPage({
  params,
}: PageProps<"/tasks/[id]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewTasks(actor)) redirect("/dashboard");

  const { id } = await params;

  const task = await db.task.findFirst({
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      estimatedHours: true,
      assigneeId: true,
      createdById: true,
      projectId: true,
      project: { select: { leadAccountId: true } },
      clientId: true,
    },
  });

  if (!task) notFound();

  // The API enforces this too; redirecting keeps someone who cannot save from
  // being shown a form that would only fail (Rules.md section 3).
  if (!canManageTask(actor, task)) redirect(`/tasks/${task.id}`);

  const [projects, clients, assigneesByProject, allEmployees] =
    await Promise.all([
      // Every project, including closed ones: the task's own project must
      // stay in the list, or editing anything else would silently move it.
      loadTaskProjects(actor),
      loadTaskClients(actor),
      loadAssigneesByProject(actor),
      loadCompanyEmployeeOptions(actor),
    ]);

  return (
    <>
      <PageHeader
        title={`Edit ${task.title}`}
        description="Comments and attachments are managed on the task page."
      />

      <Card>
        <CardContent className="py-2">
          <TaskForm
            mode="edit"
            taskId={task.id}
            cancelHref={`/tasks/${task.id}`}
            projects={projects}
            clients={clients}
            assigneesByProject={assigneesByProject}
            allEmployees={allEmployees}
            defaultValues={{
              title: task.title,
              projectId: task.projectId ?? "",
              clientId: task.clientId ?? "",
              description: task.description ?? "",
              status: task.status,
              priority: task.priority,
              assigneeId: task.assigneeId ?? "",
              dueDate: toDateInputValue(task.dueDate),
              estimatedHours: toAmountInputValue(task.estimatedHours),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
