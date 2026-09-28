"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateTime } from "@/components/ui/date-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/files";
import { isSensitiveFieldKey, type CredentialField } from "@/lib/vault";

type Revealed = {
  id: string;
  title: string;
  clientName: string;
  fields: CredentialField[];
  remark: string | null;
  file: { name: string; mimeType: string; sizeBytes: number } | null;
  updatedAt: string;
};

/**
 * Reveals one client credential (Plan: client vault). The secret is fetched
 * only when the dialog opens and dropped when it closes, so it never sits in
 * the key menu's own state or the page's HTML — the server decides, per open,
 * whether this person may still see it (access can be revoked at any time).
 */
export function CredentialViewer({
  credentialId,
  onClose,
}: {
  /** The credential to reveal, or null for a closed dialog. */
  credentialId: string | null;
  onClose: () => void;
}) {
  const [credential, setCredential] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!credentialId) return;

    let cancelled = false;
    // Deferred like the bells' fetch-on-mount (react-hooks/set-state-in-effect).
    const timer = setTimeout(async () => {
      setCredential(null);
      setError(null);
      const response = await fetch(`/api/vault/credentials/${credentialId}`);
      const body = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok) {
        setError(body?.error ?? "Could not open this credential.");
        return;
      }
      setCredential(body.credential);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [credentialId]);

  return (
    <Dialog
      open={credentialId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCredential(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{credential?.title ?? "Credential"}</DialogTitle>
          <DialogDescription>
            {credential ? (
              <>
                {credential.clientName} · updated{" "}
                <DateTime value={credential.updatedAt} />
              </>
            ) : (
              "Client credential"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3">
          {error ? (
            <p role="alert" className="text-danger-text">
              {error}
            </p>
          ) : !credential ? (
            <p className="text-text-secondary">Decrypting…</p>
          ) : (
            <>
              {credential.fields.map((field, index) => (
                <SecretField key={`${field.key}-${index}`} field={field} />
              ))}

              {credential.file ? (
                <div className="border-border bg-surface-muted flex items-center gap-3 rounded-lg border px-3 py-2">
                  <FileText
                    aria-hidden
                    className="text-brand-brown-soft size-5 shrink-0"
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {credential.file.name}
                    </span>
                    <span className="text-text-secondary text-meta">
                      {formatFileSize(credential.file.sizeBytes)}
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/vault/credentials/${credential.id}/file`}>
                      <Download aria-hidden />
                      Download
                    </a>
                  </Button>
                </div>
              ) : null}

              {credential.remark ? (
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary text-meta font-medium">
                    Remark
                  </span>
                  <p className="text-sm whitespace-pre-wrap">
                    {credential.remark}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SecretField({ field }: { field: CredentialField }) {
  const sensitive = isSensitiveFieldKey(field.key);
  const [shown, setShown] = useState(!sensitive);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the value and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-text-secondary text-meta font-medium">
        {field.key}
      </span>
      <div className="border-border bg-surface-muted flex items-center gap-1 rounded-lg border py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">
          {shown ? field.value : "•".repeat(Math.min(field.value.length, 12))}
        </span>
        {sensitive ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={shown ? `Hide ${field.key}` : `Show ${field.key}`}
            onClick={() => setShown((value) => !value)}
          >
            {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy ${field.key}`}
          onClick={copy}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </Button>
      </div>
    </div>
  );
}
