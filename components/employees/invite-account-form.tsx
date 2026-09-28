"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField, SelectField } from "@/components/forms/fields";
import { InviteLinkNotice } from "@/components/employees/invite-link-notice";
import {
  inviteCompanyAccountSchema,
  type InviteCompanyAccountInput,
} from "@/lib/validations/employees";

/**
 * Invite an Admin, Manager, HR Head or HR Team login (Architecture.md § 4 —
 * company accounts other than the first Owner are "invited by an
 * Owner/Admin"). What each level may do by default is `LEVEL_DEFAULTS`
 * (lib/permission-grants.ts); the Owner adjusts individuals on the Authority
 * page afterwards.
 *
 * Owner is deliberately absent from the list: that identity is established
 * once, by registration, and cannot be handed out.
 */
const ROLE_OPTIONS = [
  { value: "Admin", label: "Admin — full access, except the owner's settings" },
  {
    value: "Manager",
    label:
      "Manager — tasks, performance and projects; no private employee data",
  },
  {
    value: "HRHead",
    label: "HR Head — all people data, including salary and payroll",
  },
  {
    value: "HRTeam",
    label:
      "HR Team — people data, attendance and leave; no salary or HR policies",
  },
];

export function InviteAccountForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; name: string } | null>(
    null
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteCompanyAccountInput>({
    resolver: zodResolver(inviteCompanyAccountSchema),
    defaultValues: { fullName: "", workEmail: "", role: "Manager" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setInvite(null);

    const response = await fetch("/api/company-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof InviteCompanyAccountInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not send this invite.");
      return;
    }

    reset();

    if (body.emailDelivered) {
      toast.success(`Invite sent to ${body.account.workEmail}`);
    } else {
      toast.warning("Account created, but the invite email was not sent.");
      setInvite({ url: body.inviteUrl, name: body.account.fullName });
    }

    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="account-fullName"
            label="Full name"
            placeholder="Priya Sharma"
            error={errors.fullName?.message}
            {...register("fullName")}
          />
          <FormField
            id="account-workEmail"
            label="Work email"
            type="email"
            placeholder="priya@northwind.com"
            error={errors.workEmail?.message}
            {...register("workEmail")}
          />
          <SelectField
            id="account-role"
            label="Role"
            options={ROLE_OPTIONS}
            fieldClassName="sm:col-span-2"
            error={errors.role?.message}
            {...register("role")}
          />
        </div>

        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending invite…" : "Send invite"}
          </Button>
        </div>
      </form>

      {invite ? (
        <InviteLinkNotice
          url={invite.url}
          description={`${invite.name}'s account was created, but email delivery is not configured so nothing was sent. The link expires in 7 days.`}
        />
      ) : null}
    </div>
  );
}
