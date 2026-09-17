import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { canManageClients } from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import { ClientForm } from "@/components/projects/client-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Edit client — WorkPulse" };

export default async function EditClientPage({
  params,
}: PageProps<"/projects/clients/[id]/edit">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // The API enforces this too; redirecting keeps someone who cannot save from
  // being shown a form that would only fail (Rules.md section 3).
  if (!canManageClients(actor)) redirect("/projects/clients");

  const { id } = await params;

  const client = await db.client.findFirst({
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
    },
  });

  if (!client) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${client.name}`}
        description="Archiving is on the client page — it is its own action, not part of saving."
      />

      <Card>
        <CardContent className="py-2">
          <ClientForm
            mode="edit"
            clientId={client.id}
            cancelHref={`/projects/clients/${client.id}`}
            defaultValues={{
              name: client.name,
              contactName: client.contactName ?? "",
              contactEmail: client.contactEmail ?? "",
              contactPhone: client.contactPhone ?? "",
              notes: client.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
