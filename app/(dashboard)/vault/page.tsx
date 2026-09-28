import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { canManageClientVault } from "@/lib/permissions";
import { loadAccessRows, type AccessRow } from "@/lib/vault-data";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import {
  AccessTable,
  type AccessTableRow,
} from "@/components/vault/access-table";
import { RequesterVault } from "@/components/vault/requester-vault";
import { VaultTabs } from "@/components/vault/vault-tabs";

export const metadata: Metadata = { title: "Client vault" };

function toTableRow(row: AccessRow): AccessTableRow {
  return {
    ...row,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/**
 * The client vault (Plan: client vault).
 *
 * A vault manager lands on access control: the pending queue and everyone
 * who currently holds access. Everyone else gets the same client/credential
 * browser as the top-bar key menu — this is where their "access approved"
 * notification points.
 */
export default async function VaultPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  if (!canManageClientVault(actor)) {
    return (
      <>
        <PageHeader
          title="Client vault"
          description="Logins, invoices and documents the agency holds for its clients. Pick the ones you need from a client and a manager will approve them."
        />
        <RequesterVault />
      </>
    );
  }

  const [pending, approved] = await Promise.all([
    loadAccessRows(actor, "Pending"),
    loadAccessRows(actor, "Approved"),
  ]);

  return (
    <>
      <PageHeader
        title="Client vault"
        description="Decide who can see client credentials, and withdraw access once it is no longer needed."
      />
      <VaultTabs />

      <section className="mb-10 flex flex-col gap-4">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Waiting for a decision ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="When someone asks for a client's credentials from the key menu, it lands here."
          />
        ) : (
          <AccessTable rows={pending.map(toTableRow)} mode="pending" />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Who has access ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <EmptyState
            title="Nobody has access yet"
            description="Approved requests appear here, where you can revoke them at any time."
          />
        ) : (
          <AccessTable rows={approved.map(toTableRow)} mode="approved" />
        )}
      </section>
    </>
  );
}
