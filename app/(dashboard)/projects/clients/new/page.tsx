import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageClients } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { ClientForm } from "@/components/projects/client-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Add client — WorkPulse" };

export default async function NewClientPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // The API enforces this too; redirecting here keeps a role that cannot add
  // clients from being shown a form that would only fail (Rules.md section 3).
  if (!canManageClients(actor)) redirect("/projects/clients");

  return (
    <>
      <PageHeader
        title="Add a client"
        description="Only the name is required — contact details can follow."
      />

      <Card>
        <CardContent className="py-2">
          <ClientForm
            mode="create"
            cancelHref="/projects/clients"
            defaultValues={{
              name: "",
              contactName: "",
              contactEmail: "",
              contactPhone: "",
              notes: "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
