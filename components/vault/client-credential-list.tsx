"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, FileText, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/page-header";
import { CredentialViewer } from "@/components/vault/credential-viewer";
import {
  CredentialFormDialog,
  type CredentialFormTarget,
} from "@/components/vault/credential-form";
import { formatFileSize } from "@/lib/files";
import type { CredentialKind } from "@/lib/vault";

export type CredentialListItem = {
  id: string;
  title: string;
  kind: CredentialKind;
  fileName: string | null;
  fileSizeBytes: number | null;
  updatedAt: string;
  approvedCount: number;
};

/**
 * One client's credentials for a vault manager (Plan: client vault): add,
 * view, edit and delete. Values are never part of this list — viewing and
 * editing each fetch the decrypted credential on demand.
 */
export function ClientCredentialList({
  clientId,
  clientName,
  credentials,
}: {
  clientId: string;
  clientName: string;
  credentials: CredentialListItem[];
}) {
  const router = useRouter();
  const [viewing, setViewing] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<CredentialFormTarget>(null);
  const [deleting, setDeleting] = useState<CredentialListItem | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const response = await fetch(`/api/vault/credentials/${deleting.id}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      toast.error(body?.error ?? "Could not delete that credential.");
      return;
    }
    toast.success("Credential deleted");
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={() => setFormTarget({ mode: "create" })}>
          <Plus aria-hidden />
          Add credential
        </Button>
      </div>

      {credentials.length === 0 ? (
        <EmptyState
          title="No credentials yet"
          description={`Store ${clientName}'s social logins, portal passwords, invoices and documents here. Your team can then ask for exactly the ones they need.`}
        />
      ) : (
        <ul className="border-border bg-surface divide-border divide-y rounded-xl border">
          {credentials.map((credential) => {
            const Icon = credential.kind === "file" ? FileText : KeyRound;
            return (
              <li
                key={credential.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <Icon
                  aria-hidden
                  className="text-brand-brown-soft size-5 shrink-0"
                  strokeWidth={1.5}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate font-medium">
                    {credential.title}
                  </p>
                  <p className="text-text-secondary text-meta">
                    {credential.kind === "file" && credential.fileName
                      ? `${credential.fileName} · ${formatFileSize(credential.fileSizeBytes ?? 0)}`
                      : "Text"}
                    {" · "}
                    {credential.approvedCount === 1
                      ? "1 person has access"
                      : `${credential.approvedCount} people have access`}
                    {" · updated "}
                    <DateTime value={credential.updatedAt} />
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`View ${credential.title}`}
                    onClick={() => setViewing(credential.id)}
                  >
                    <Eye aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${credential.title}`}
                    onClick={() => setFormTarget({ mode: "edit", credential })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${credential.title}`}
                    onClick={() => setDeleting(credential)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CredentialViewer
        credentialId={viewing}
        onClose={() => setViewing(null)}
      />

      <CredentialFormDialog
        clientId={clientId}
        target={formTarget}
        onClose={() => setFormTarget(null)}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.title}?</DialogTitle>
            <DialogDescription>
              The stored secret is destroyed and
              {deleting && deleting.approvedCount > 0
                ? ` the ${deleting.approvedCount === 1 ? "person" : `${deleting.approvedCount} people`} who can see it lose access.`
                : " any pending requests for it are dropped."}{" "}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={confirmDelete}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
