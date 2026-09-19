"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { AUDIENCE_LABELS, type BulkEmailAudience } from "@/lib/bulk-email";

type Person = {
  kind: "employee" | "account";
  id: string;
  name: string;
  role: string;
};

const AUDIENCES: BulkEmailAudience[] = [
  "Everyone",
  "Employees",
  "CompanyAccounts",
  "Specific",
];

/**
 * Compose and send a company-wide email (Plan: bulk email).
 *
 * The recipient count is fetched from the same endpoint that does the sending
 * (`?preview=1`), so the number shown is resolved by the identical query the
 * send will use — a count computed separately in the browser could disagree
 * with what actually goes out.
 */
export function BulkEmailForm() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<BulkEmailAudience>("Everyone");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/directory")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setPeople(data.people);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const employeeIds = people
    .filter((person) => person.kind === "employee" && picked.has(person.id))
    .map((person) => person.id);
  const accountIds = people
    .filter((person) => person.kind === "account" && picked.has(person.id))
    .map((person) => person.id);

  // Re-previewed whenever the audience changes, so the count on the button is
  // never stale relative to what is selected.
  useEffect(() => {
    let cancelled = false;

    // Deferred to a timer rather than run in the effect body, the same shape
    // `message-thread.tsx` uses — setting state synchronously here would
    // cascade a second render on every audience change.
    const timer = setTimeout(async () => {
      setRecipientCount(null);

      if (
        audience === "Specific" &&
        employeeIds.length + accountIds.length === 0
      ) {
        setRecipientCount(0);
        return;
      }

      const response = await fetch("/api/bulk-email?preview=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || "preview",
          body: body || "preview",
          audience,
          employeeIds,
          accountIds,
          attachmentIds: [],
        }),
      });

      if (!response.ok || cancelled) return;
      const data = await response.json();
      if (!cancelled) setRecipientCount(data.recipientCount);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, employeeIds.join(","), accountIds.join(",")]);

  function togglePerson(id: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    try {
      const response = await fetch("/api/bulk-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          audience,
          employeeIds,
          accountIds,
          attachmentIds: attachments.map((file) => file.id),
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not send that email.");
        return;
      }

      if (data.deliveredCount === 0 && data.recipientCount > 0) {
        // `sendEmail` degrades to console logging when no provider is
        // configured, so "sent to 0 of 12" is the expected local-dev result
        // and worth naming rather than showing as a bare success.
        toast.warning(
          `Reached 0 of ${data.recipientCount}. Check Settings → Email delivery.`
        );
      } else {
        toast.success(
          `Sent to ${data.deliveredCount} of ${data.recipientCount}.`
        );
      }

      setSubject("");
      setBody("");
      setAttachments([]);
    } finally {
      setSending(false);
    }
  }

  const canSend =
    subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <form onSubmit={send} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-brand-brown mb-2 font-medium">Send to</legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={audience === option}
              onClick={() => setAudience(option)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                audience === option
                  ? "border-brand-yellow bg-brand-yellow text-primary-foreground font-medium"
                  : "border-border text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown"
              )}
            >
              {AUDIENCE_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      {audience === "Specific" ? (
        <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
          {people.length === 0 ? (
            <p className="text-text-secondary px-3 py-4 text-sm">Loading…</p>
          ) : (
            <ul className="divide-border divide-y">
              {people.map((person) => (
                <li key={`${person.kind}-${person.id}`}>
                  <label className="hover:bg-surface-muted flex cursor-pointer items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={picked.has(person.id)}
                      onChange={() => togglePerson(person.id)}
                      className="accent-brand-yellow size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-sm">
                        {person.name}
                      </span>
                      <span className="text-text-secondary text-meta block truncate">
                        {person.role}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="bulk-subject" className="text-brand-brown font-medium">
          Subject
        </label>
        <Input
          id="bulk-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Holiday schedule for December"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="bulk-body" className="text-brand-brown font-medium">
          Message
        </label>
        <Textarea
          id="bulk-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
          placeholder="Write your message…"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-brand-brown font-medium">Attachments</span>
        <FileUpload value={attachments} onChange={setAttachments} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-text-secondary text-sm">
          {recipientCount === null
            ? "Counting recipients…"
            : recipientCount === 1
              ? "1 person will receive this."
              : `${recipientCount} people will receive this.`}
        </p>
        <Button type="submit" disabled={!canSend || recipientCount === 0}>
          <Send aria-hidden className="size-4" />
          {sending ? "Sending…" : "Send email"}
        </Button>
      </div>
    </form>
  );
}
