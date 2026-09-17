import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FolderPlus, Pencil } from "lucide-react";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import { formatDate, formatMoney } from "@/lib/format";
import { loadCurrency } from "@/lib/project-data";
import {
  canCreateProjects,
  canManageClients,
  canViewProjects,
} from "@/lib/permissions";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  ClientStatusBadge,
  ProjectStatusBadge,
} from "@/components/projects/status-badge";
import { ClientStatusActions } from "@/components/projects/client-status-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Client — WorkPulse" };

/** Client detail, and the projects being delivered for them. */
export default async function ClientPage({
  params,
}: PageProps<"/projects/clients/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewProjects(actor)) redirect("/dashboard");

  const { id } = await params;

  const client = await db.client.findFirst({
    // Tenant scoping (Rules.md section 2): an id from another company reads as
    // "not found" rather than revealing that the record exists.
    where: scopedWhere(actor, { id }),
    select: {
      id: true,
      name: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      notes: true,
      status: true,
      createdAt: true,
      projects: {
        where: { deletedAt: null },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          dueDate: true,
          value: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!client) notFound();

  const currency = await loadCurrency(actor);
  const mayManage = canManageClients(actor);

  return (
    <>
      <Link
        href="/projects/clients"
        className="text-text-secondary hover:text-brand-brown mb-4 inline-flex items-center gap-1.5"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
        Back to clients
      </Link>

      <PageHeader
        title={client.name}
        description={
          client.projects.length === 1
            ? "1 project"
            : `${client.projects.length} projects`
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ClientStatusBadge status={client.status} />
            {mayManage ? (
              <>
                <Button asChild variant="outline">
                  <Link href={`/projects/clients/${client.id}/edit`}>
                    <Pencil aria-hidden />
                    Edit client
                  </Link>
                </Button>
                <ClientStatusActions
                  clientId={client.id}
                  status={client.status}
                  name={client.name}
                  projectCount={client.projects.length}
                />
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">Contact</h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Main contact" value={client.contactName} />
              <Detail label="Email" value={client.contactEmail} />
              <Detail label="Phone" value={client.contactPhone} />
              <Detail label="Added" value={formatDate(client.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 py-2">
            <h2 className="text-h3 text-brand-brown font-semibold">Notes</h2>
            {client.notes ? (
              <p className="text-foreground whitespace-pre-line">
                {client.notes}
              </p>
            ) : (
              <p className="text-text-secondary">No notes yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h3 text-brand-brown font-semibold">Projects</h2>
            {canCreateProjects(actor) && client.status === "Active" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/projects/new">
                  <FolderPlus aria-hidden />
                  New project
                </Link>
              </Button>
            ) : null}
          </div>

          {client.projects.length === 0 ? (
            <p className="text-text-secondary">
              No projects for {client.name} yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-(--color-border)">
              {client.projects.map((project) => (
                <li
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-brand-brown font-medium underline-offset-4 hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="text-text-secondary text-meta">
                      {[
                        project.code,
                        `${project._count.members} on the team`,
                        project.dueDate
                          ? `due ${formatDate(project.dueDate)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-text-secondary">
                      {formatMoney(project.value, currency)}
                    </span>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
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
