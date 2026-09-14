"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  FormError,
  FormField,
  SelectField,
  TextareaField,
  type SelectGroup,
} from "@/components/forms/fields";
import { InviteLinkNotice } from "@/components/employees/invite-link-notice";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  type UpdateEmployeeInput,
} from "@/lib/validations/employees";

/**
 * Add and edit an employee (Phases.md Phase 3).
 *
 * One component covers both, because the fields and the validation rules are
 * the same — only the endpoint and the personal-details section differ. Keeping
 * them together is what stops the two forms drifting apart.
 */

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "FullTime", label: "Full time" },
  { value: "PartTime", label: "Part time" },
  { value: "Contract", label: "Contract" },
  { value: "Intern", label: "Intern" },
];

export type EmployeeFormValues = UpdateEmployeeInput;

export function EmployeeForm({
  mode,
  employeeId,
  defaultValues,
  departments,
  managerGroups,
  canEditPersonal,
  cancelHref,
  /**
   * Where a successful edit routes to. Defaults to the Employees directory
   * profile — `squad/[memberKind]/[memberId]/edit/page.tsx` passes its own
   * Squad detail path instead, so a granted employee editing a colleague
   * from Squad lands back on Squad rather than `/employees/[id]`, a page
   * they cannot open.
   */
  editRedirectHref,
}: {
  mode: "create" | "edit";
  employeeId?: string;
  defaultValues: EmployeeFormValues;
  /** Existing department names, offered as suggestions but not a fixed list. */
  departments: string[];
  managerGroups: SelectGroup[];
  canEditPersonal: boolean;
  cancelHref: string;
  editRedirectHref?: string;
}) {
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
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(
      mode === "create" ? createEmployeeSchema : updateEmployeeSchema
    ),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setInvite(null);

    const response = await fetch(
      mode === "create" ? "/api/employees" : `/api/employees/${employeeId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof EmployeeFormValues, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this employee.");
      return;
    }

    if (mode === "edit") {
      toast.success("Profile updated");
      router.push(editRedirectHref ?? `/employees/${employeeId}`);
      router.refresh();
      return;
    }

    reset(defaultValues);

    if (body.emailDelivered) {
      toast.success(`Invite sent to ${body.employee.companyEmail}`);
      router.push(`/employees/${body.employee.id}`);
      router.refresh();
      return;
    }

    // Email is not configured, so keep the admin here with the link to share.
    toast.warning("Employee added, but the invite email was not sent.");
    setInvite({ url: body.inviteUrl, name: body.employee.fullName });
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        <FormError message={formError} />

        <Section
          title="Identity"
          description="How they are identified in your workspace and at sign-in."
        >
          <FormField
            id="fullName"
            label="Full name"
            placeholder="Rahul Mehta"
            error={errors.fullName?.message}
            {...register("fullName")}
          />
          <FormField
            id="companyEmail"
            label="Work email"
            type="email"
            placeholder="rahul@northwind.com"
            error={errors.companyEmail?.message}
            {...register("companyEmail")}
          />
          <FormField
            id="employeeCode"
            label="Employee ID"
            placeholder="EMP-001"
            hint="They can sign in with this or their work email."
            error={errors.employeeCode?.message}
            {...register("employeeCode")}
          />
        </Section>

        <Section
          title="Role and reporting"
          description="Where they sit in the company."
        >
          <FormField
            id="departmentName"
            label="Department"
            list="department-suggestions"
            placeholder="Design"
            hint="Pick an existing one or type a new one."
            error={errors.departmentName?.message}
            {...register("departmentName")}
          />
          <datalist id="department-suggestions">
            {departments.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <FormField
            id="jobRole"
            label="Job title"
            placeholder="Senior Designer"
            error={errors.jobRole?.message}
            {...register("jobRole")}
          />
          <SelectField
            id="employmentType"
            label="Employment type"
            placeholder="Not set"
            options={EMPLOYMENT_TYPE_OPTIONS}
            error={errors.employmentType?.message}
            {...register("employmentType")}
          />
          <FormField
            id="startDate"
            label="Start date"
            type="date"
            error={errors.startDate?.message}
            {...register("startDate")}
          />
          <SelectField
            id="manager"
            label="Reports to"
            placeholder="No manager"
            groups={managerGroups}
            hint="Used to build the org chart."
            error={errors.manager?.message}
            {...register("manager")}
          />
        </Section>

        {canEditPersonal ? (
          <Section
            title="Personal details"
            description="Only owners, admins, HR and this person's own manager can see these."
          >
            <FormField
              id="personalEmail"
              label="Personal email"
              type="email"
              error={errors.personalEmail?.message}
              {...register("personalEmail")}
            />
            <FormField
              id="phone"
              label="Phone"
              type="tel"
              error={errors.phone?.message}
              {...register("phone")}
            />
            <FormField
              id="dateOfBirth"
              label="Date of birth"
              type="date"
              error={errors.dateOfBirth?.message}
              {...register("dateOfBirth")}
            />
            <FormField
              id="location"
              label="Location"
              placeholder="Bengaluru"
              error={errors.location?.message}
              {...register("location")}
            />
            <TextareaField
              id="address"
              label="Address"
              fieldClassName="sm:col-span-2"
              error={errors.address?.message}
              {...register("address")}
            />
            <FormField
              id="emergencyContactName"
              label="Emergency contact"
              error={errors.emergencyContactName?.message}
              {...register("emergencyContactName")}
            />
            <FormField
              id="emergencyContactPhone"
              label="Emergency contact phone"
              type="tel"
              error={errors.emergencyContactPhone?.message}
              {...register("emergencyContactPhone")}
            />
          </Section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : mode === "create"
                ? "Add employee and send invite"
                : "Save changes"}
          </Button>
          <Button asChild variant="ghost">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </div>
      </form>

      {invite ? (
        <InviteLinkNotice
          url={invite.url}
          description={`${invite.name} was added, but email delivery is not configured so nothing was sent. The link expires in 7 days.`}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 text-brand-brown font-semibold">{title}</h2>
        <p className="text-text-secondary text-meta">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
