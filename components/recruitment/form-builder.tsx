"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_QUESTIONS_PER_FORM,
  QUESTION_TYPES,
  QUESTION_TYPE_HINTS,
  QUESTION_TYPE_LABELS,
  hasOptions,
} from "@/lib/recruitment";
import type { HiringQuestionType } from "@/lib/generated/prisma/enums";

type DraftQuestion = {
  key: string;
  type: HiringQuestionType;
  label: string;
  helpText: string;
  required: boolean;
  options: string[];
};

export type BuilderForm = {
  id: string;
  title: string;
  summary: string | null;
  confirmationMessage: string | null;
  team: string | null;
  location: string | null;
  employmentType: "FullTime" | "PartTime" | "Contract" | "Intern" | null;
  closesAt: Date | null;
  questions: {
    id: string;
    type: HiringQuestionType;
    label: string;
    helpText: string | null;
    required: boolean;
    options: string[];
  }[];
};

const EMPLOYMENT_TYPES = [
  { value: "", label: "Not specified" },
  { value: "FullTime", label: "Full time" },
  { value: "PartTime", label: "Part time" },
  { value: "Contract", label: "Contract" },
  { value: "Intern", label: "Internship" },
] as const;

let keyCounter = 0;
const nextKey = () => `q${(keyCounter += 1)}`;

function blankQuestion(): DraftQuestion {
  return {
    key: nextKey(),
    type: "ShortText",
    label: "",
    helpText: "",
    required: false,
    options: [],
  };
}

/**
 * Build or edit a recruitment form (Plan: hiring).
 *
 * Questions are held in local state and saved as one list, which matches how
 * the server stores them — it rewrites the whole list on every save so `order`
 * stays gapless. Nothing here is auto-saved: a half-written question that
 * reached a live form would be seen by candidates.
 */
export function FormBuilder({ form }: { form?: BuilderForm }) {
  const router = useRouter();
  const editing = Boolean(form);

  const [title, setTitle] = useState(form?.title ?? "");
  const [summary, setSummary] = useState(form?.summary ?? "");
  const [confirmationMessage, setConfirmationMessage] = useState(
    form?.confirmationMessage ?? ""
  );
  const [team, setTeam] = useState(form?.team ?? "");
  const [location, setLocation] = useState(form?.location ?? "");
  const [employmentType, setEmploymentType] = useState<string>(
    form?.employmentType ?? ""
  );
  const [closesAt, setClosesAt] = useState(
    form?.closesAt ? form.closesAt.toISOString().slice(0, 10) : ""
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    form?.questions.map((question) => ({
      key: nextKey(),
      type: question.type,
      label: question.label,
      helpText: question.helpText ?? "",
      required: question.required,
      options: question.options,
    })) ?? [blankQuestion()]
  );
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function patch(key: string, changes: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((question) =>
        question.key === key ? { ...question, ...changes } : question
      )
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;

    setQuestions((current) => {
      const next = [...current];
      [next[index]!, next[target]!] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setFieldErrors({});

    const payload = {
      title,
      summary: summary || null,
      confirmationMessage: confirmationMessage || null,
      team: team || null,
      location: location || null,
      employmentType: employmentType || null,
      closesAt: closesAt || null,
      questions: questions.map((question) => ({
        type: question.type,
        label: question.label,
        helpText: question.helpText || null,
        required: question.required,
        options: hasOptions(question.type) ? question.options : [],
      })),
    };

    try {
      const response = await fetch(
        editing ? `/api/hiring/forms/${form!.id}` : "/api/hiring/forms",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data?.fieldErrors) setFieldErrors(data.fieldErrors);
        toast.error(data?.error ?? "Could not save this form.");
        return;
      }

      toast.success(editing ? "Form saved." : "Form created as a draft.");
      router.push(`/hiring/${data.formId}`);
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-h2 text-brand-brown font-semibold">The role</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="title">Role title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senior Motion Designer"
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? (
              <p className="text-danger-text text-meta">{fieldErrors.title}</p>
            ) : (
              <p className="text-text-secondary text-meta">
                This is the heading applicants see, and it sets the page&rsquo;s
                URL when you publish.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="summary">One-line summary</Label>
            <Input
              id="summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Own the motion language across our client work."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team">Team</Label>
            <Input
              id="team"
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              placeholder="Design"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Bengaluru, hybrid"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employmentType">Employment type</Label>
            <select
              id="employmentType"
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value)}
              className="border-input bg-surface focus-visible:ring-brand-yellow h-9 rounded-md border px-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              {EMPLOYMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="closesAt">Closes on</Label>
            <Input
              id="closesAt"
              type="date"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
            <p className="text-text-secondary text-meta">
              Optional. After this date the form stops accepting applications on
              its own.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="confirmationMessage">
              What applicants read after they submit
            </Label>
            <Textarea
              id="confirmationMessage"
              value={confirmationMessage}
              onChange={(event) => setConfirmationMessage(event.target.value)}
              rows={3}
              placeholder="We read every application ourselves and reply within two weeks, either way."
            />
            <p className="text-text-secondary text-meta">
              Optional, but this is the last thing a candidate hears from you.
              Saying when they will hear back is worth more than thanking them.
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-h2 text-brand-brown font-semibold">Questions</h2>
          <p className="text-text-secondary mt-1 max-w-2xl">
            Every form already asks for a name, email address and phone number —
            you do not need to add those. Anything below is what else you want
            to know.
          </p>
        </div>

        <ol className="flex flex-col gap-4">
          {questions.map((question, index) => (
            <li
              key={question.key}
              className="border-border bg-surface rounded-xl border p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-text-secondary flex items-center gap-2 font-medium">
                  <GripVertical
                    aria-hidden
                    className="size-4"
                    strokeWidth={1.5}
                  />
                  Question {index + 1}
                </span>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move question ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp aria-hidden className="size-4" strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move question ${index + 1} down`}
                    disabled={index === questions.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown
                      aria-hidden
                      className="size-4"
                      strokeWidth={1.5}
                    />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() =>
                      setQuestions((current) =>
                        current.filter((entry) => entry.key !== question.key)
                      )
                    }
                  >
                    <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`label-${question.key}`}>Question</Label>
                  <Input
                    id={`label-${question.key}`}
                    value={question.label}
                    onChange={(event) =>
                      patch(question.key, { label: event.target.value })
                    }
                    placeholder="Tell us about a project you are proud of"
                    aria-invalid={Boolean(
                      fieldErrors[`questions.${index}.label`]
                    )}
                  />
                  {fieldErrors[`questions.${index}.label`] ? (
                    <p className="text-danger-text text-meta">
                      {fieldErrors[`questions.${index}.label`]}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`type-${question.key}`}>Answer type</Label>
                  <select
                    id={`type-${question.key}`}
                    value={question.type}
                    onChange={(event) => {
                      const type = event.target.value as HiringQuestionType;
                      patch(question.key, {
                        type,
                        options: hasOptions(type)
                          ? question.options.length > 0
                            ? question.options
                            : ["", ""]
                          : [],
                      });
                    }}
                    className="border-input bg-surface focus-visible:ring-brand-yellow h-9 rounded-md border px-3 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {QUESTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {QUESTION_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <p className="text-text-secondary text-meta">
                    {QUESTION_TYPE_HINTS[question.type]}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor={`help-${question.key}`}>
                    Help text <span className="text-text-secondary">(optional)</span>
                  </Label>
                  <Input
                    id={`help-${question.key}`}
                    value={question.helpText}
                    onChange={(event) =>
                      patch(question.key, { helpText: event.target.value })
                    }
                    placeholder="Roughly 200 words is plenty."
                  />
                </div>

                {hasOptions(question.type) ? (
                  <fieldset className="flex flex-col gap-2 sm:col-span-2">
                    <legend className="mb-1.5 font-medium">Choices</legend>

                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <Input
                          value={option}
                          aria-label={`Choice ${optionIndex + 1}`}
                          onChange={(event) =>
                            patch(question.key, {
                              options: question.options.map((entry, entryIndex) =>
                                entryIndex === optionIndex
                                  ? event.target.value
                                  : entry
                              ),
                            })
                          }
                          placeholder={`Choice ${optionIndex + 1}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove choice ${optionIndex + 1}`}
                          disabled={question.options.length <= 2}
                          onClick={() =>
                            patch(question.key, {
                              options: question.options.filter(
                                (_, entryIndex) => entryIndex !== optionIndex
                              ),
                            })
                          }
                        >
                          <X aria-hidden className="size-4" strokeWidth={1.5} />
                        </Button>
                      </div>
                    ))}

                    {fieldErrors[`questions.${index}.options`] ? (
                      <p className="text-danger-text text-meta">
                        {fieldErrors[`questions.${index}.options`]}
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      disabled={question.options.length >= MAX_OPTIONS_PER_QUESTION}
                      onClick={() =>
                        patch(question.key, {
                          options: [...question.options, ""],
                        })
                      }
                    >
                      <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                      Add choice
                    </Button>
                  </fieldset>
                ) : null}

                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                      patch(question.key, { required: event.target.checked })
                    }
                    className="accent-brand-yellow size-4"
                  />
                  <span>Applicants must answer this</span>
                </label>
              </div>
            </li>
          ))}
        </ol>

        <Button
          type="button"
          variant="outline"
          className={cn("self-start", questions.length === 0 && "mt-2")}
          disabled={questions.length >= MAX_QUESTIONS_PER_FORM}
          onClick={() =>
            setQuestions((current) => [...current, blankQuestion()])
          }
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          Add question
        </Button>
      </section>

      <div className="border-border flex items-center gap-3 border-t pt-6">
        <Button onClick={save} disabled={saving || title.trim().length === 0}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create draft"}
        </Button>
        <p className="text-text-secondary text-meta">
          {editing
            ? "Saving does not change whether the form is live."
            : "Nothing is public until you publish it."}
        </p>
      </div>
    </div>
  );
}
