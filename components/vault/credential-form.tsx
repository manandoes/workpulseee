"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, KeyRound, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError, FormField, TextareaField } from "@/components/forms/fields";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  formatFileSize,
} from "@/lib/files";
import {
  DEFAULT_TEXT_FIELDS,
  type CredentialField,
  type CredentialKind,
} from "@/lib/vault";
import {
  credentialFormSchema,
  type CredentialFormInput,
} from "@/lib/validations/vault";

export type EditableCredential = {
  id: string;
  title: string;
  kind: CredentialKind;
  fileName: string | null;
};

/** `create`, `edit` one, or closed. */
export type CredentialFormTarget =
  { mode: "create" } | { mode: "edit"; credential: EditableCredential } | null;

/**
 * Add or edit a client credential (Plan: client vault) — a vault manager
 * types a title ("Instagram — @brand"), then either key/value text fields
 * (Username, Password, …) or a document, plus an optional remark.
 */
export function CredentialFormDialog({
  clientId,
  target,
  onClose,
}: {
  clientId: string;
  target: CredentialFormTarget;
  onClose: () => void;
}) {
  const editing = target?.mode === "edit" ? target.credential : null;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit credential" : "Add credential"}
          </DialogTitle>
          <DialogDescription>
            Stored encrypted. Only vault managers and people you approve can see
            anything beyond the title.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          // Keyed so every open starts from a fresh form.
          <CredentialForm
            key={editing?.id ?? "new"}
            clientId={clientId}
            credential={editing}
            onDone={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CredentialForm({
  clientId,
  credential,
  onDone,
}: {
  clientId: string;
  credential: EditableCredential | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(credential === null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CredentialFormInput>({
    resolver: zodResolver(credentialFormSchema),
    defaultValues: {
      title: credential?.title ?? "",
      kind: credential?.kind ?? "text",
      fields: credential ? [] : DEFAULT_TEXT_FIELDS,
      remark: "",
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "fields",
  });
  const kind = useWatch({ control, name: "kind" });

  // Editing starts from the decrypted values, fetched only once the dialog
  // is open — the list page never holds them.
  useEffect(() => {
    if (!credential) return;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/vault/credentials/${credential.id}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(body?.error ?? "Could not load this credential.");
        return;
      }
      const revealed: { fields: CredentialField[]; remark: string | null } =
        body.credential;
      reset({
        title: credential.title,
        kind: credential.kind,
        fields:
          credential.kind === "text" && revealed.fields.length > 0
            ? revealed.fields
            : credential.kind === "text"
              ? DEFAULT_TEXT_FIELDS
              : [],
        remark: revealed.remark ?? "",
      });
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [credential, reset]);

  function switchKind(next: CredentialKind) {
    if (next === kind) return;
    setValue("kind", next);
    // A file credential stores no fields, and a text one needs some.
    replace(next === "text" ? DEFAULT_TEXT_FIELDS : []);
    setFileError(null);
  }

  function pickFile(picked: File | undefined) {
    setFileError(null);
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      setFileError("That file is larger than 5 MB.");
      return;
    }
    setFile(picked);
  }

  const keepsStoredFile =
    credential?.kind === "file" && credential.fileName !== null;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (values.kind === "file" && !file && !keepsStoredFile) {
      setFileError("Choose a file to upload.");
      return;
    }

    const body = new FormData();
    body.append(
      "payload",
      JSON.stringify(credential ? values : { ...values, clientId })
    );
    if (values.kind === "file" && file) body.append("file", file);

    const response = await fetch(
      credential
        ? `/api/vault/credentials/${credential.id}`
        : "/api/vault/credentials",
      { method: credential ? "PATCH" : "POST", body }
    );
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const fieldErrors = (result?.fieldErrors ?? {}) as Record<string, string>;
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === "file") setFileError(message);
        else setError(field as keyof CredentialFormInput, { message });
      }
      if (Object.keys(fieldErrors).length === 0) {
        setFormError(result?.error ?? "Could not save this credential.");
      }
      return;
    }

    toast.success(credential ? "Credential updated" : "Credential added");
    onDone();
    router.refresh();
  });

  if (!loaded) {
    return formError ? (
      <div className="mt-4">
        <FormError message={formError} />
      </div>
    ) : (
      <p className="text-text-secondary mt-4">Decrypting…</p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-5">
      <FormError message={formError} />

      <FormField
        id="credential-title"
        label="Title"
        placeholder="e.g. Instagram — @brandname"
        error={errors.title?.message}
        {...register("title")}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-brand-brown font-medium">Type</span>
        <div
          role="radiogroup"
          aria-label="Credential type"
          className="border-border bg-surface-muted inline-flex w-fit gap-1 rounded-lg border p-1"
        >
          {(
            [
              { value: "text", label: "Text", icon: KeyRound },
              { value: "file", label: "File", icon: FileText },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => switchKind(option.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                kind === option.value
                  ? "bg-surface text-brand-brown shadow-sm"
                  : "text-text-secondary hover:text-brand-brown"
              )}
            >
              <option.icon aria-hidden className="size-4" strokeWidth={1.5} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {kind === "text" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-brand-brown mb-1.5 font-medium">
            Fields
          </legend>
          {fields.map((field, index) => {
            const keyError = errors.fields?.[index]?.key?.message;
            const valueError = errors.fields?.[index]?.value?.message;
            return (
              <div key={field.id} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Input
                    aria-label={`Field ${index + 1} name`}
                    aria-invalid={keyError ? true : undefined}
                    placeholder="Name"
                    className="h-9 w-2/5"
                    {...register(`fields.${index}.key`)}
                  />
                  <Input
                    aria-label={`Field ${index + 1} value`}
                    aria-invalid={valueError ? true : undefined}
                    placeholder="Value"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 flex-1 font-mono"
                    {...register(`fields.${index}.value`)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove field ${index + 1}`}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                {keyError || valueError ? (
                  <p className="text-danger-text text-meta">
                    {keyError ?? valueError}
                  </p>
                ) : null}
              </div>
            );
          })}
          {errors.fields?.message ? (
            <p className="text-danger-text text-meta">
              {errors.fields.message}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fields.length >= 20}
              onClick={() => append({ key: "", value: "" })}
            >
              <Plus aria-hidden />
              Add field
            </Button>
          </div>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-brand-brown font-medium">File</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              pickFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip aria-hidden />
              {file || keepsStoredFile ? "Replace file" : "Choose file"}
            </Button>
            <span className="text-text-secondary min-w-0 truncate text-sm">
              {file
                ? `${file.name} · ${formatFileSize(file.size)}`
                : keepsStoredFile
                  ? `Keeping ${credential?.fileName}`
                  : "PDF, image, Office document or zip — up to 5 MB"}
            </span>
          </div>
          {fileError ? (
            <p className="text-danger-text text-meta">{fileError}</p>
          ) : null}
        </div>
      )}

      <TextareaField
        id="credential-remark"
        label="Remark (optional)"
        rows={3}
        placeholder="e.g. 2FA codes go to the client's phone — ask before logging in."
        error={errors.remark?.message}
        {...register("remark")}
      />

      <DialogFooter className="mt-0">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : credential ? "Save changes" : "Add"}
        </Button>
      </DialogFooter>
    </form>
  );
}
