import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageClientVault } from "@/lib/permissions";
import { loadClientVault } from "@/lib/vault-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { VaultTabs } from "@/components/vault/vault-tabs";
import { ClientCredentialList } from "@/components/vault/client-credential-list";

export const metadata: Metadata = { title: "Client credentials" };

/** One client's credentials, for a vault manager (Plan: client vault). */
export default async function ClientVaultPage({
  params,
}: PageProps<"/vault/credentials/[clientId]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canManageClientVault(actor)) redirect("/vault");

  const { clientId } = await params;
  const vault = await loadClientVault(actor, clientId);
  if (!vault) notFound();

  return (
    <>
      <PageHeader
        title={vault.client.name}
        description={
          <>
            Credentials held for this client
            {vault.client.status === "Archived" ? " (past client)" : ""}.{" "}
            <Link
              href="/vault/credentials"
              className="text-brand-brown underline-offset-4 hover:underline"
            >
              All clients
            </Link>
          </>
        }
      />
      <VaultTabs />

      <ClientCredentialList
        clientId={vault.client.id}
        clientName={vault.client.name}
        credentials={vault.credentials.map((credential) => ({
          ...credential,
          updatedAt: credential.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}
