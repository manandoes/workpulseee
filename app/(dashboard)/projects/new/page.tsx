import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadClients, loadCurrency, loadLeadOptions } from "@/lib/project-data";
import { canCreateProjects } from "@/lib/permissions";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "New project — WorkPulse" };

/**
 * Start a project (Phases.md Phase 4 — "a manager can create a client, create a
 * project under that client, and assign a team").
 */
export default async function NewProjectPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // The API enforces this too; redirecting here keeps a role that cannot create
  // projects from being shown a form that would only fail (Rules.md section 3).
  if (!canCreateProjects(actor)) redirect("/projects");

  const [clients, leads, currency] = await Promise.all([
    loadClients(actor),
    loadLeadOptions(actor),
    loadCurrency(actor),
  ]);

  /**
   * Architecture.md section 4: every project belongs to a client, and an
   * archived client is not taken on for new work.
   */
  const available = clients.filter((client) => client.status === "Active");

  if (available.length === 0) {
    return (
      <>
        <PageHeader
          title="New project"
          description="Every project belongs to a client."
        />
        <EmptyState
          title="Add a client first"
          description={
            clients.length === 0
              ? "A project is always delivered for a client, so start by adding one."
              : "All of your clients are archived. Restore one, or add a new client, and then start the project."
          }
          action={
            <Button asChild>
              <Link href="/projects/clients/new">Add a client</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New project"
        description="You can assign the team once the project exists."
      />

      <Card>
        <CardContent className="py-2">
          <ProjectForm
            mode="create"
            cancelHref="/projects"
            currency={currency}
            clients={available.map((client) => ({
              value: client.id,
              label: client.name,
            }))}
            leads={leads}
            defaultValues={{
              name: "",
              clientId: available.length === 1 ? available[0].id : "",
              code: "",
              description: "",
              status: "Planning",
              startDate: "",
              dueDate: "",
              value: "",
              estimatedCost: "",
              // The creator leads by default, which is what keeps a Manager
              // able to edit the project they just created.
              lead: actor.id,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
