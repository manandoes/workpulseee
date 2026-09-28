import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import {
  loadAssignableAccountOptions,
  loadAssigneesByProject,
  loadCompanyEmployeeOptions,
  loadTaskClients,
  loadTaskProjects,
} from "@/lib/task-data";
import { canViewTasks } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New task" };

/**
 * Raise a task (Phases.md Phase 5) — on a project, or standalone as a quick
 * personal to-do.
 *
 * Whether the caller may actually file it under the project they choose is
 * settled by the API against that project's lead — this page only keeps a role
 * that has no business here out of the form (Rules.md section 3).
 */
export default async function NewTaskPage({
  searchParams,
}: PageProps<"/tasks/new">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewTasks(actor)) redirect("/dashboard");

  const { projectId } = await searchParams;

  const [projects, clients, assigneesByProject, allEmployees, accounts] =
    await Promise.all([
      // Completed and cancelled projects are not offered: new work almost
      // never belongs on one, and an existing task on one is still editable.
      loadTaskProjects(actor, { openOnly: true, manageableOnly: true }),
      loadTaskClients(actor),
      loadAssigneesByProject(actor),
      loadCompanyEmployeeOptions(actor),
      loadAssignableAccountOptions(actor),
    ]);

  /** Arriving from a project page pre-selects that project. */
  const preselected =
    typeof projectId === "string" &&
    projects.some((project) => project.value === projectId)
      ? projectId
      : projects.length === 1
        ? projects[0].value
        : "";

  return (
    <>
      <PageHeader
        title="New task"
        description="File it under a project, or leave it standalone as a quick personal to-do."
      />

      <Card>
        <CardContent className="py-2">
          <TaskForm
            mode="create"
            cancelHref="/tasks"
            projects={projects}
            clients={clients}
            assigneesByProject={assigneesByProject}
            allEmployees={allEmployees}
            assignableAccounts={accounts}
            defaultValues={{
              title: "",
              projectId: preselected,
              clientId: "",
              description: "",
              status: "Todo",
              priority: "Medium",
              assigneeId: "",
              dueDate: "",
              estimatedHours: "",
              completionNote: "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
