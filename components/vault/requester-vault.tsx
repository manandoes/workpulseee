"use client";

import { useState } from "react";
import { CredentialViewer } from "@/components/vault/credential-viewer";
import {
  useVaultBrowser,
  VaultBrowser,
} from "@/components/vault/vault-browser";

/**
 * The requester's full-page vault (Plan: client vault) — the same browser as
 * the top-bar key menu, somewhere a "your access was approved" notification
 * can link to.
 */
export function RequesterVault() {
  const { data, failed, refresh } = useVaultBrowser();
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <div className="border-border bg-surface max-w-2xl overflow-hidden rounded-xl border">
      <VaultBrowser
        data={data}
        failed={failed}
        onView={setViewing}
        onRequested={refresh}
      />
      <CredentialViewer
        credentialId={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
