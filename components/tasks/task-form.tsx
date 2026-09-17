"use client";

import { useState } from "react";
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
  type SelectOption,
} from "@/components/forms/fields";
import {
  taskPriorityLabel,
  taskStatusLabel,
} from "@/components/tasks/status-badge";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks";
import {
  createTaskSchema,
  type CreateTaskInput,
} from "@/lib/validations/tasks";
import { cn } from "cn";

/** The three shapes a task's target can take. */
type TargetType = "project" | "client" | "general";

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: "project", label: "Project" },
  { value: "client", label: "Client" },
  { value: "general", label: "General" },
];

/**
 * Create and edit a task (Phases.md Phase 5).
 *
 * One component covers both, because the fields and the validation rules are
 * the same — only the endpoint differs. Comments and attachments live on the
 * task page rather than here, so adding one is a single action and not a form
 * save.
 */
const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({
  value: status,
  label: taskStatusLabel(status),
}));

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  value: priority,
  label: taskPriorityLabel(priority),
}));

export function TaskForm({
  mode,
  taskId,
  defaultValues,
  projects,
  clients,
  assigneesByProject,
  allEmployees,
  cancelHref,
}: {
  mode: "create" | "edit";
  taskId?: string;
  defaultValues: CreateTaskInput;
  projects: SelectOption[];
  /** Active clients a task can be filed directly under. */
  clients: SelectOption[];
  /** Each project's team, keyed by project id. */
  assigneesByProject: Record<string, SelectOption[]>;
  /** Every active employee in the company. */
  allEmployees: SelectOption[];
  cancelHref: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<TargetType>(
    defaultValues.projectId
      ? "project"
      : defaultValues.clientId
        ? "client"
        : "general"
  );

  const {
    register,
    handleSubmit,
    setError,
    resetField,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues,
  });

  /**
   * The assignee list follows the chosen project, so watching it here keeps
   * the picker honest without a round trip on every change.
   *
   * `useWatch` rather than the form's `watch()`: it subscribes to this one
   * field, and it is the variant React Compiler can memoise.
   */
  const projectId = useWatch({ control, name: "projectId" }) ?? "";
  const teamOptions = assigneesByProject[projectId] ?? [];

  function selectTargetType(next: TargetType) {
    setTargetType(next);
    if (next !== "project") {
      resetField("projectId", { defaultValue: "" });
      resetField("assigneeId", { defaultValue: "" });
    }
    if (next !== "client") resetField("clientId", { defaultValue: "" });
  }
  const teamIds = new Set(teamOptions.map((option) => option.value));
  // Picking one of these on a project task adds them to its team on save
  // (`resolveTaskWrite` in lib/task-data.ts) — assigning and staffing in one step.
  const otherOptions = allEmployees.filter(
    (option) => !teamIds.has(option.value)
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch(
      mode === "create" ? "/api/tasks" : `/api/tasks/${taskId}`,
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
          setError(field as keyof CreateTaskInput, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this task.");
      return;
    }

    if (mode === "edit" && body.stillManageable === false) {
      /**
       * They moved the task to a project somebody else leads, or detached it
       * into a standalone task somebody else raised — either way they've just
       * given away the right to manage it further. Better to say so here than
       * to let them discover it through a refused save.
       */
      toast.warning("Task saved, but you can no longer manage it from here.");
      router.push("/tasks");
      router.refresh();
      return;
    }

    toast.success(
      mode === "create" ? `${body.task.title} created` : "Task updated"
    );
    router.push(`/tasks/${taskId ?? body.task.id}`);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FormError message={formError} />

      <Section
        title="The work"
        description="What needs doing, and where it sits."
      >
        <FormField
          id="title"
          label="Title"
          placeholder="Draft the homepage copy"
          fieldClassName="sm:col-span-2"
          error={errors.title?.message}
          {...register("title")}
        />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-meta text-text-secondary font-medium">
            File under
          </span>
          <div role="radiogroup" aria-label="Task target" className="flex gap-1">
            {TARGET_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                role="radio"
                aria-checked={targetType === type.value}
                onClick={() => selectTargetType(type.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-colors",
                  targetType === type.value
                    ? "bg-brand-yellow-light text-brand-brown"
                    : "text-text-secondary hover:bg-surface-muted hover:text-brand-brown"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
          <p className="text-text-secondary text-meta">
            A project task inherits that project&apos;s team and budget; a
            client task and a general task are both personal to whoever
            raises them.
          </p>
        </div>

        {targetType === "project" ? (
          <SelectField
            id="projectId"
            label="Project"
            options={projects}
            error={errors.projectId?.message}
            {...register("projectId", {
              /**
               * The person selected may not be on the new project's team, and
               * leaving a stale name in the box would only fail on save.
               */
              onChange: () => resetField("assigneeId", { defaultValue: "" }),
            })}
          />
        ) : null}

        {targetType === "client" ? (
          <SelectField
            id="clientId"
            label="Client"
            options={clients}
            error={errors.clientId?.message}
            {...register("clientId")}
          />
        ) : null}

        <SelectField
          id="assigneeId"
          label="Assignee"
          placeholder="Unassigned"
          options={!projectId ? allEmployees : undefined}
          groups={
            projectId
              ? [
                  ...(teamOptions.length
                    ? [{ label: "This project's team", options: teamOptions }]
                    : []),
                  ...(otherOptions.length
                    ? [
                        {
                          label: "Other employees — added to the team on save",
                          options: otherOptions,
                        },
                      ]
                    : []),
                ]
              : undefined
          }
          hint={
            !projectId
              ? "Any active employee can take a personal task."
              : "Picking someone not yet on the team adds them to it."
          }
          error={errors.assigneeId?.message}
          {...register("assigneeId")}
        />
      </Section>

      <Section
        title="Scheduling"
        description="Where it stands, how urgent it is, and when it is needed."
      >
        <SelectField
          id="status"
          label="Status"
          options={STATUS_OPTIONS}
          error={errors.status?.message}
          {...register("status")}
        />
        <SelectField
          id="priority"
          label="Priority"
          options={PRIORITY_OPTIONS}
          error={errors.priority?.message}
          {...register("priority")}
        />
        <FormField
          id="dueDate"
          label="Due date"
          type="date"
          hint="A task past this date is flagged overdue until it is done."
          error={errors.dueDate?.message}
          {...register("dueDate")}
        />
        <FormField
          id="estimatedHours"
          label="Estimated effort (hours)"
          inputMode="decimal"
          placeholder="6"
          hint="Used to work out workload in a later phase."
          error={errors.estimatedHours?.message}
          {...register("estimatedHours")}
        />
      </Section>

      <Section
        title="Detail"
        description="Anything the assignee needs to know."
      >
        <TextareaField
          id="description"
          label="Description"
          rows={5}
          fieldClassName="sm:col-span-2"
          error={errors.description?.message}
          {...register("description")}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : mode === "create"
              ? "Create task"
              : "Save changes"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
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
