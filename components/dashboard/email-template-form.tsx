"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { INVITE_TEMPLATE_VARIABLES, renderTemplate } from "@/lib/mailer";

type Kind = "EmployeeInvite" | "AccountInvite";

type Template = {
  kind: Kind;
  subject: string;
  body: string;
  attachmentIds: string[];
};

const KIND_LABELS: Record<Kind, string> = {
  EmployeeInvite: "Employee invite",
  AccountInvite: "Admin / manager / HR invite",
};

/** What the preview substitutes, so the Owner sees a real email not placeholders. */
const SAMPLE = {
  employeeName: "Priya Sharma",
  companyName: "Your company",
  inviteUrl: "https://workpulse.app/invite/sample-token",
  role: "HR",
};

const DEFAULT_BODY = [
  "Hi {{employeeName}},",
  "",
  "{{companyName}} has added you to WorkPulse. Use the link below to choose a password and sign in:",
  "",
  "{{inviteUrl}}",
  "",
  "This link expires in 7 days.",
].join("\n");

/**
 * Edit the invite emails a company sends (Plan: editable invite template).
 *
 * An unedited kind has no row and keeps WorkPulse's built-in copy — which is
 * why "Reset" deletes rather than rewriting to a default: absence is what
 * means "use the built-in one" (`buildInviteEmail`).
 */
export function EmailTemplateForm({
  templates,
  attachments: initialAttachments,
}: {
  templates: Template[];
  attachments: Record<string, UploadedFile[]>;
}) {
  const [kind, setKind] = useState<Kind>("EmployeeInvite");
  const [drafts, setDrafts] = useState<Record<Kind, Template>>(() => ({
    EmployeeInvite: templates.find((t) => t.kind === "EmployeeInvite") ?? {
      kind: "EmployeeInvite",
      subject: "Set up your {{companyName}} account on WorkPulse",
      body: DEFAULT_BODY,
      attachmentIds: [],
    },
    AccountInvite: templates.find((t) => t.kind === "AccountInvite") ?? {
      kind: "AccountInvite",
      subject: "Your {{role}} account for {{companyName}} on WorkPulse",
      body: DEFAULT_BODY,
      attachmentIds: [],
    },
  }));
  const [files, setFiles] = useState<Record<Kind, UploadedFile[]>>({
    EmployeeInvite: initialAttachments.EmployeeInvite ?? [],
    AccountInvite: initialAttachments.AccountInvite ?? [],
  });
  const [busy, setBusy] = useState(false);

  const draft = drafts[kind];
  const customised = templates.some((template) => template.kind === kind);

  function update(patch: Partial<Template>) {
    setDrafts((previous) => ({
      ...previous,
      [kind]: { ...previous[kind], ...patch },
    }));
  }

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          subject: draft.subject,
          body: draft.body,
          attachmentIds: files[kind].map((file) => file.id),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not save that template.");
        return;
      }

      toast.success("Invite template saved.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings/email-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });

      if (!response.ok) {
        toast.error("Could not reset that template.");
        return;
      }

      toast.success("Back to the built-in email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABELS) as Kind[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              kind === option
                ? "border-brand-yellow bg-brand-yellow text-primary-foreground font-medium"
                : "border-border text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown"
            )}
          >
            {KIND_LABELS[option]}
          </button>
        ))}
      </div>

      <p className="text-text-secondary text-meta">
        Available variables:{" "}
        {INVITE_TEMPLATE_VARIABLES.map((name) => `{{${name}}}`).join(", ")}
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="template-subject" className="text-brand-brown font-medium">
          Subject
        </label>
        <Input
          id="template-subject"
          value={draft.subject}
          onChange={(event) => update({ subject: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="template-body" className="text-brand-brown font-medium">
          Body
        </label>
        <Textarea
          id="template-body"
          value={draft.body}
          onChange={(event) => update({ body: event.target.value })}
          rows={10}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-brand-brown font-medium">Attachments</span>
        <p className="text-text-secondary text-meta">
          Sent with every invite of this kind — a handbook or policy PDF, for
          example.
        </p>
        <FileUpload
          value={files[kind]}
          onChange={(next) =>
            setFiles((previous) => ({ ...previous, [kind]: next }))
          }
        />
      </div>

      <div className="border-border bg-surface-muted rounded-lg border p-4">
        <p className="text-brand-brown mb-2 text-sm font-medium">Preview</p>
        <p className="text-foreground mb-2 text-sm font-medium">
          {renderTemplate(draft.subject, SAMPLE)}
        </p>
        <pre className="text-text-secondary font-sans text-sm whitespace-pre-wrap">
          {renderTemplate(draft.body, SAMPLE)}
        </pre>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save template"}
        </Button>
        {customised ? (
          <Button
            type="button"
            variant="ghost"
            onClick={reset}
            disabled={busy}
          >
            Use the built-in email
          </Button>
        ) : null}
      </div>
    </div>
  );
}
