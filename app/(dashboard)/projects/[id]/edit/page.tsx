import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { toAmountInputValue, toDateInputValue } from "@/lib/format";
import { loadClients, loadCurrency, loadLeadOptions } from "@/lib/project-data";
import { canManageProject, canViewProjects } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit project — WorkPulse" };

export default async function EditProjectPage({
  params,
}: PageProps<"/projects/[id]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewProjects(actor)) redirect("/dashboard");

  const { id } = await params;

  const project = await db.project.findFirst({
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
      clientId: true,
      leadAccountId: true,
    },
  });

  if (!project) notFound();

  // The API enforces this too; redirecting keeps someone who cannot save from
  // being shown a form that would only fail (Rules.md section 3).
  if (!canManageProject(actor, project)) redirect(`/projects/${project.id}`);

  const [clients, leads, currency] = await Promise.all([
    loadClients(actor),
    loadLeadOptions(actor),
    loadCurrency(actor),
  ]);

  /**
   * Archived clients are not offered for new work, but the project's own client
   * stays in the list — otherwise editing anything else on a project would
   * silently move it to a different client.
   */
  const options = clients
    .filter(
      (client) => client.status === "Active" || client.id === project.clientId
    )
    .map((client) => ({
      value: client.id,
      label:
        client.status === "Archived"
          ? `${client.name} (archived)`
          : client.name,
    }));

  return (
    <>
      <PageHeader
        title={`Edit ${project.name}`}
        description="The team is managed on the project page."
      />

      <Card>
        <CardContent className="py-2">
          <ProjectForm
            mode="edit"
            projectId={project.id}
            cancelHref={`/projects/${project.id}`}
            currency={currency}
            clients={options}
            leads={leads}
            defaultValues={{
              name: project.name,
              clientId: project.clientId,
              code: project.code ?? "",
              description: project.description ?? "",
              status: project.status,
              startDate: toDateInputValue(project.startDate),
              dueDate: toDateInputValue(project.dueDate),
              value: toAmountInputValue(project.value),
              estimatedCost: toAmountInputValue(project.estimatedCost),
              lead: project.leadAccountId ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
