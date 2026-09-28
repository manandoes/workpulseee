import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getActor } from "@/lib/auth";
import { canManageClientVault } from "@/lib/permissions";
import { loadVaultClients } from "@/lib/vault-data";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { VaultTabs } from "@/components/vault/vault-tabs";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Client credentials" };

/**
 * Pick a client to manage its credentials (Plan: client vault) — current
 * clients first, then archived ones, whose credentials may still be needed.
 */
export default async function VaultCredentialsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageClientVault(actor)) redirect("/vault");

  const clients = await loadVaultClients(actor);

  return (
    <>
      <PageHeader
        title="Client vault"
        description="Store each client's logins, invoices and documents. Everything but the title is encrypted."
      />
      <VaultTabs />

      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add a client first, then store their credentials here."
          action={
            <Button asChild>
              <Link href="/projects/clients/new">Add a client</Link>
            </Button>
          }
        />
      ) : (
        <ul className="border-border bg-surface divide-border divide-y rounded-xl border">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/vault/credentials/${client.id}`}
                className="hover:bg-surface-muted flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="text-foreground min-w-0 flex-1 truncate font-medium">
                  {client.name}
                </span>
                {client.status === "Archived" ? (
                  <span className="text-text-secondary text-meta">Past</span>
                ) : null}
                <span className="text-text-secondary text-meta">
                  {client.credentialCount === 1
                    ? "1 credential"
                    : `${client.credentialCount} credentials`}
                </span>
                <ChevronRight
                  aria-hidden
                  className="text-text-secondary size-4"
                  strokeWidth={1.5}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
