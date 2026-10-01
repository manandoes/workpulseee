"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormError,
  FormField,
  SelectField,
  TextareaField,
} from "@/components/forms/fields";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { requestTypeLabel } from "@/components/requests/status-badge";
import {
  LEAVE_DAY_PARTS,
  REQUEST_TYPES,
  dayPartLabel,
  requestNeedsAmount,
  requestNeedsDateRange,
  requestNeedsDayPart,
} from "@/lib/requests";
import {
  createRequestSchema,
  type CreateRequestInput,
} from "@/lib/validations/requests";

/**
 * An approver option for the request form (Phase 21).
 */
type ApproverOption = {
  id: string;
  name: string;
  kind: "account" | "employee";
  roleOrJobRole: string;
};

const TYPE_OPTIONS = REQUEST_TYPES.map((type) => ({
  value: type,
  label: requestTypeLabel(type),
}));

const DAY_PART_OPTIONS = LEAVE_DAY_PARTS.map((dayPart) => ({
  value: dayPart,
  label: dayPartLabel(dayPart),
}));

export function RequestForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [loadingApprovers, setLoadingApprovers] = useState(true);
  // "account:<id>" / "employee:<id>" — one picker feeding the two form fields.
  const [approverChoice, setApproverChoice] = useState("");
  // Files uploaded before form submission; attached alongside the request.
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      type: "Leave",
      subject: "",
      description: "",
      startDate: "",
      endDate: "",
      dayPart: "FullDay",
      amount: "",
      requestedApproverAccountId: "",
      requestedApproverEmployeeId: "",
    },
  });

  const type = useWatch({ control, name: "type" });
  const needsDateRange = requestNeedsDateRange(type);
  const needsAmount = requestNeedsAmount(type);
  const needsDayPart = requestNeedsDayPart(type);

  // Fetch approvers on mount
  useEffect(() => {
    async function fetchApprovers() {
      try {
        const response = await fetch("/api/requests/approvers");
        if (response.ok) {
          const body = await response.json();
          setApprovers(body.approvers || []);
        } else {
          toast.error("Could not load approvers.");
        }
      } catch {
        toast.error("Could not load approvers.");
      } finally {
        setLoadingApprovers(false);
      }
    }
    fetchApprovers();
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        attachmentFileIds: uploadedFiles.map((file) => file.id),
      }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof CreateRequestInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not submit this request.");
      return;
    }

    toast.success("Request submitted");
    router.push(`/my-space/requests/${body.request.id}`);
    router.refresh();
  });

  if (loadingApprovers) {
    return (
      <div className="flex flex-col gap-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-muted" />
          <div className="h-10 bg-muted" />
          <div className="h-10 bg-muted" />
          <div className="h-32 bg-muted" />
          <div className="h-10 bg-muted" />
        </div>
      </div>
    );
  }

  const accountApprovers = approvers.filter((a) => a.kind === "account");
  const employeeApprovers = approvers.filter((a) => a.kind === "employee");

  const approverGroups = [
    {
      label: "Company accounts",
      options: accountApprovers.map((a) => ({
        value: `account:${a.id}`,
        label: `${a.name} (${a.roleOrJobRole})`,
      })),
    },
    {
      label: "Employees",
      options: employeeApprovers.map((a) => ({
        value: `employee:${a.id}`,
        label: `${a.name} (${a.roleOrJobRole})`,
      })),
    },
  ].filter((group) => group.options.length > 0);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormError message={formError} />

      <SelectField
        id="type"
        label="Request type"
        options={TYPE_OPTIONS}
        error={errors.type?.message}
        {...register("type")}
      />

      <FormField
        id="subject"
        label="Subject"
        placeholder="Two days of leave for a family event"
        error={errors.subject?.message}
        {...register("subject")}
      />

      {needsDateRange ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="startDate"
            label="Start date"
            type="date"
            error={errors.startDate?.message}
            {...register("startDate")}
          />
          <FormField
            id="endDate"
            label="End date"
            type="date"
            error={errors.endDate?.message}
            {...register("endDate")}
          />
        </div>
      ) : null}

      {needsDayPart ? (
        <SelectField
          id="dayPart"
          label="Day part"
          options={DAY_PART_OPTIONS}
          hint="A first or second half must be a single day."
          error={errors.dayPart?.message}
          {...register("dayPart")}
        />
      ) : null}

      {needsAmount ? (
        <FormField
          id="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="1500"
          hint="In your company's currency."
          error={errors.amount?.message}
          {...register("amount")}
        />
      ) : null}

      <TextareaField
        id="description"
        label="Details"
        rows={5}
        placeholder="Anything your manager or HR needs to know to decide."
        error={errors.description?.message}
        {...register("description")}
      />

      {needsAmount ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Receipt / supporting file
          </span>
          <p className="text-sm text-text-secondary">
            Attach a receipt, invoice, or any other file that supports this
            claim. PDFs and images are fine — up to 10 files, 5 MB each.
          </p>
          <FileUpload
            value={uploadedFiles}
            onChange={setUploadedFiles}
            multiple
            label="Attach files"
          />
        </div>
      ) : null}

      {approvers.length > 0 ? (
        <>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground">
              Submit to <span className="text-brand-brown">*</span>
            </label>
            <p className="text-sm text-text-secondary">
              Choose who this request is addressed to. Only that person (or the
              company owner) can approve or reject it.
            </p>
          </div>
          <SelectField
            id="approver"
            label="Approver"
            placeholder="Choose who to submit this request to"
            groups={approverGroups}
            error={
              errors.requestedApproverAccountId?.message ??
              errors.requestedApproverEmployeeId?.message
            }
            value={approverChoice}
            onChange={(event) => {
              const value = event.target.value;
              setApproverChoice(value);
              const [kind, id = ""] = value.split(":");
              const opts = { shouldValidate: isSubmitted };
              setValue(
                "requestedApproverAccountId",
                kind === "account" ? id : "",
                opts
              );
              setValue(
                "requestedApproverEmployeeId",
                kind === "employee" ? id : "",
                opts
              );
            }}
          />
        </>
      ) : (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
          No one in your company can approve requests. Please contact your
          administrator.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting || approvers.length === 0}>
          {isSubmitting ? "Submitting…" : "Submit request"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/my-space/requests">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
