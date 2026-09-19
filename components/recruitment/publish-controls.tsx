"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type {
  HiringFormDestination,
  HiringFormStatus,
} from "@/lib/generated/prisma/enums";

/**
 * Publishing, and everything that follows from it (Plan: hiring).
 *
 * A draft offers the two destinations as a real choice with their consequences
 * stated, because they are not interchangeable: the hosted page keeps the
 * applicant inside the company's own URL and feeds this pipeline directly,
 * while a Google Form lives on the company's Google account and has to be
 * pulled in. Once published the choice is gone — the destination is baked into
 * the link candidates already hold — so the controls become the ones that
 * matter afterwards: copy the link, sync, close.
 */
export function PublishControls({
  formId,
  status,
  destination,
  publicUrl,
  googleResponderUrl,
  googleEditUrl,
  googleSyncedAt,
  googleConnected,
  questionCount,
}: {
  formId: string;
  status: HiringFormStatus;
  destination: HiringFormDestination;
  publicUrl: string;
  googleResponderUrl: string | null;
  googleEditUrl: string | null;
  googleSyncedAt: Date | null;
  googleConnected: boolean;
  questionCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const liveUrl =
    destination === "GoogleForm" ? (googleResponderUrl ?? "") : publicUrl;

  async function publish(target: HiringFormDestination) {
    setBusy(target);
    try {
      const response = await fetch(`/api/hiring/forms/${formId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: target }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not publish this form.");
        return;
      }

      if (data?.downgradedDocuments?.length) {
        // Google's API cannot create file-upload questions. Saying so once,
        // here, is the difference between a known trade and a form that
        // quietly lost its CV field.
        toast.warning(
          `Google Forms cannot take file uploads, so ${data.downgradedDocuments.join(
            ", "
          )} now asks for a link instead.`,
          { duration: 10_000 }
        );
      } else {
        toast.success("Published.");
      }

      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(next: HiringFormStatus) {
    setBusy(next);
    try {
      const response = await fetch(`/api/hiring/forms/${formId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) throw new Error("status change failed");

      toast.success(
        next === "Closed" ? "Closed to new applications." : "Open again."
      );
      router.refresh();
    } catch {
      toast.error("Could not change the status. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      const response = await fetch(`/api/hiring/forms/${formId}/sync`, {
        method: "POST",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not sync from Google.");
        return;
      }

      toast.success(
        data.imported === 0
          ? "Nothing new on Google."
          : `${data.imported} new ${data.imported === 1 ? "applicant" : "applicants"} imported.`
      );
      router.refresh();
    } catch {
      toast.error("Could not reach Google. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it manually.");
    }
  }

  if (status === "Draft") {
    return (
      <div className="border-border bg-surface-muted flex flex-col gap-4 rounded-xl border p-5">
        <div>
          <h2 className="text-h3 text-brand-brown font-semibold">
            Where should applicants answer this?
          </h2>
          <p className="text-text-secondary mt-1 max-w-2xl">
            You choose once. The link you hand out is the one candidates keep,
            so the destination cannot change afterwards.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="text-brand-brown font-medium">On your own URL</h3>
            <p className="text-text-secondary flex-1">
              Applicants answer at <code className="break-all">{publicUrl}</code>,
              in your company&rsquo;s colours. Document uploads work, and
              everything lands in this pipeline the moment it is submitted.
            </p>
            <Button
              className="self-start"
              disabled={busy !== null || questionCount === 0}
              onClick={() => publish("Hosted")}
            >
              {busy === "Hosted" ? "Publishing…" : "Publish here"}
            </Button>
            {questionCount === 0 ? (
              <p className="text-text-secondary text-meta">
                Add at least one question first.
              </p>
            ) : null}
          </div>

          <div className="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="text-brand-brown font-medium">As a Google Form</h3>
            <p className="text-text-secondary flex-1">
              We create the real form on your connected Google account. You can
              edit it in Google afterwards, and pull responses in here whenever
              you want. Google cannot do file uploads through its API, so an
              upload question becomes a link question.
            </p>
            <Button
              variant="outline"
              className="self-start"
              disabled={busy !== null || !googleConnected}
              onClick={() => publish("GoogleForm")}
            >
              {busy === "GoogleForm" ? "Creating…" : "Create Google Form"}
            </Button>
            {!googleConnected ? (
              <p className="text-text-secondary text-meta">
                Connect a Google account on the Hiring page first.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface-muted flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 text-brand-brown font-semibold">
          {destination === "GoogleForm"
            ? "Answered on Google Forms"
            : "Answered on your careers URL"}
        </h2>
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="text-info-text break-all underline underline-offset-4"
        >
          {liveUrl}
        </a>
        {destination === "GoogleForm" ? (
          <p className="text-text-secondary text-meta">
            {googleSyncedAt
              ? `Responses last pulled in ${formatDateTime(googleSyncedAt)}.`
              : "Responses have never been pulled in."}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? (
            <Check aria-hidden className="size-4" strokeWidth={1.5} />
          ) : (
            <Copy aria-hidden className="size-4" strokeWidth={1.5} />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>

        {destination === "GoogleForm" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={sync}
            >
              <RefreshCw aria-hidden className="size-4" strokeWidth={1.5} />
              {busy === "sync" ? "Syncing…" : "Sync responses"}
            </Button>
            {googleEditUrl ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={googleEditUrl} target="_blank" rel="noreferrer">
                  <ExternalLink
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.5}
                  />
                  Edit in Google
                </a>
              </Button>
            ) : null}
          </>
        ) : null}

        {status === "Live" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => setStatus("Closed")}
          >
            Close to new applications
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => setStatus("Live")}
          >
            Reopen
          </Button>
        )}
      </div>
    </div>
  );
}
