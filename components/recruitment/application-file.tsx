"use client";

import { useMemo, useState } from "react";
import { Check, Paperclip } from "lucide-react";
import { completeness, isAnswered } from "@/lib/recruitment";
import { formatFileSize } from "@/lib/files";
import { QuestionField } from "@/components/recruitment/question-field";
import type { PublicForm } from "@/lib/recruitment-public-data";

/**
 * The application, composed as the document the reviewer will open
 * (Plan: hiring; direction contract "The Application File").
 *
 * The contents rail is not decoration: on a long form it is the only thing
 * that tells an applicant how much is left and, after a failed submit, which
 * section holds the problem. It counts *required* questions only — telling
 * someone they are 6 of 20 done when fourteen are optional is how a form talks
 * a good candidate out of finishing.
 *
 * Validation errors come back from the server keyed by question id, because
 * the server is the only thing that knows what this form actually required.
 * The client re-checks nothing except file size, which it can usefully catch
 * before an upload rather than after.
 */
type Values = Record<string, string | string[]>;

const IDENTITY_SECTION = "about-you";
const QUESTIONS_SECTION = "questions";

export function ApplicationFile({
  form,
  companyName,
  submitUrl,
}: {
  form: PublicForm;
  companyName: string;
  submitUrl: string;
}) {
  const [values, setValues] = useState<Values>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const answers = useMemo(() => {
    const merged: Record<string, unknown> = { ...values };
    for (const [questionId, file] of Object.entries(files)) {
      if (file) merged[questionId] = file;
    }
    return merged;
  }, [values, files]);

  const identityDone = completeness(
    [
      { id: "fullName", required: true },
      { id: "email", required: true },
    ],
    values
  );
  const questionsDone = completeness(form.questions, answers);

  const attachments = Object.entries(files).filter(
    (entry): entry is [string, File] => entry[1] !== null
  );

  if (submitted) {
    return (
      <section
        aria-live="polite"
        className="mx-auto w-full max-w-2xl px-4 py-24 text-center"
      >
        <span
          aria-hidden
          className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-(--file-accent)"
        >
          <Check
            className="size-7 text-(--file-on-accent)"
            strokeWidth={2}
          />
        </span>
        {/* An h2: the role title in the page header above is the h1. */}
        <h2 className="text-(--file-head) text-3xl font-semibold">
          Your application is in.
        </h2>
        <p className="text-(--file-muted) mx-auto mt-3 max-w-prose text-lg whitespace-pre-line">
          {form.confirmationMessage?.trim() ||
            `${companyName} has your answers for ${form.title}. If they want to take it further, they will reach you on the email address you gave.`}
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      // Extra bottom room below `lg` for the sticky bar that sits over the
      // page's last few centimetres on a phone.
      className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-8 px-4 pb-32 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:px-8 lg:pb-24"
    >
      <div className="min-w-0">
        <Section
          id={IDENTITY_SECTION}
          title="About you"
          note="So they know who applied, and how to reach you."
        >
          <Field
            id="fullName"
            label="Full name"
            required
            error={errors.fullName}
          >
            <input
              id="fullName"
              name="fullName"
              autoComplete="name"
              value={(values.fullName as string) ?? ""}
              onChange={(event) => setValue("fullName", event.target.value)}
              aria-invalid={errors.fullName ? true : undefined}
              className={`${inputClass} ${NAME_WIDTH}`}
            />
          </Field>

          <Field
            id="email"
            label="Email address"
            required
            error={errors.email}
            help="This is where any reply will go."
          >
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={(values.email as string) ?? ""}
              onChange={(event) => setValue("email", event.target.value)}
              aria-invalid={errors.email ? true : undefined}
              className={`${inputClass} ${EMAIL_WIDTH}`}
            />
          </Field>

          <Field id="phone" label="Phone number" error={errors.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={(values.phone as string) ?? ""}
              onChange={(event) => setValue("phone", event.target.value)}
              aria-invalid={errors.phone ? true : undefined}
              className={`${inputClass} ${PHONE_WIDTH}`}
            />
          </Field>
        </Section>

        {form.questions.length > 0 ? (
          <Section
            id={QUESTIONS_SECTION}
            title={`Questions from ${companyName}`}
            note={null}
          >
            {form.questions.map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={values[question.id]}
                file={files[question.id] ?? null}
                error={errors[question.id]}
                onChange={(value) => setValue(question.id, value)}
                onFile={(file) =>
                  setFiles((current) => ({ ...current, [question.id]: file }))
                }
                onFileRejected={(message) =>
                  setErrors((current) => ({
                    ...current,
                    [question.id]: message,
                  }))
                }
              />
            ))}
          </Section>
        ) : null}

        {/*
          The honeypot. Hidden from sight and from assistive technology, and
          never focusable — a real applicant cannot fill it, which is what
          makes a filled value meaningful.

          Clipped rather than parked off-canvas at a negative offset: an
          off-canvas child still contributes to the document's scroll width,
          which on a phone shows up as the whole page sliding sideways.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute h-px w-px overflow-hidden [clip-path:inset(50%)]"
        >
          <label htmlFor="company">Company</label>
          <input id="company" name="company" tabIndex={-1} autoComplete="off" />
        </div>
      </div>

      {/*
        Only the per-section counts hide below `lg`, because the sticky bar
        already reports progress there and two readouts disagreeing is worse
        than one. Everything else in this panel — the attachment list, the
        failure message, and the "nothing is sent yet" reassurance — stays on
        the phone, where a no-account applicant with one attempt needs it most.
      */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="rounded-xl border border-(--file-rule) bg-white p-5">
          <h2 className="text-(--file-head) mb-4 font-semibold">
            Your file
          </h2>

          <ul className="mb-5 hidden flex-col gap-3 lg:flex">
            <ContentsRow
              href={`#${IDENTITY_SECTION}`}
              label="About you"
              done={identityDone.answered}
              total={identityDone.required}
            />
            {form.questions.length > 0 ? (
              <ContentsRow
                href={`#${QUESTIONS_SECTION}`}
                label="Questions"
                done={questionsDone.answered}
                total={questionsDone.required}
              />
            ) : null}
          </ul>

          {attachments.length > 0 ? (
            <div className="mb-5 border-t border-(--file-rule) pt-4">
              <h3 className="text-(--file-muted) mb-2 text-xs font-medium tracking-wide uppercase">
                Attached
              </h3>
              <ul className="flex flex-col gap-2">
                {attachments.map(([questionId, file]) => (
                  <li
                    key={questionId}
                    className="flex items-center gap-2 text-(--file-ink)"
                  >
                    <Paperclip
                      aria-hidden
                      className="text-(--file-muted) size-3.5 shrink-0"
                      strokeWidth={1.5}
                    />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-(--file-muted) shrink-0 text-xs">
                      {formatFileSize(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {formError ? (
            <p
              role="alert"
              className="mb-4 text-(--file-required)"
            >
              {formError}
            </p>
          ) : null}

          {/* Below `lg` the sticky bar carries the action instead, so the form
              never shows two submit buttons at once. */}
          <button
            type="submit"
            disabled={submitting}
            className="hidden w-full rounded-lg bg-(--file-accent) px-4 py-2.5 font-medium text-(--file-on-accent) transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-(--file-accent) focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 lg:block"
          >
            {submitting ? "Sending…" : "Submit application"}
          </button>

          <p className="text-(--file-muted) mt-3 text-xs">
            {companyName} receives your answers and any files you attached.
            Nothing is sent until you press submit.
          </p>
        </div>
      </aside>

      {/*
        On a phone the contents rail cannot follow the reader down a form this
        long, so it collapses to the two things that still matter in view: how
        much is left, and the way to send it.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-(--file-rule) bg-(--file-paper)/95 backdrop-blur-sm lg:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <p className="text-(--file-muted) min-w-0 flex-1 text-sm">
            <span className="text-(--file-ink) font-medium tabular-nums">
              {identityDone.answered + questionsDone.answered}/
              {identityDone.required + questionsDone.required}
            </span>{" "}
            answered
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-lg bg-(--file-accent) px-5 py-2.5 font-medium text-(--file-on-accent) transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-(--file-accent) focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Submit"}
          </button>
        </div>
      </div>
    </form>
  );

  function setValue(key: string, value: string | string[]) {
    setValues((current) => ({ ...current, [key]: value }));
    // Clearing on edit rather than re-validating: the server owns the rules,
    // and a stale red message under a field someone just fixed is worse than
    // no message.
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const body = new FormData();
    body.set("fullName", (values.fullName as string) ?? "");
    body.set("email", (values.email as string) ?? "");
    body.set("phone", (values.phone as string) ?? "");
    body.set("company", "");

    for (const question of form.questions) {
      const file = files[question.id];
      if (file) {
        body.set(question.id, file);
        continue;
      }

      const value = values[question.id];
      if (Array.isArray(value)) {
        for (const entry of value) body.append(question.id, entry);
      } else if (isAnswered(value)) {
        body.set(question.id, value as string);
      }
    }

    try {
      const response = await fetch(submitUrl, { method: "POST", body });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (data?.fieldErrors) setErrors(data.fieldErrors);
        setFormError(
          data?.fieldErrors
            ? "Some answers need another look — they are marked above."
            : (data?.error ?? "Something went wrong. Try again.")
        );

        /*
          Take the applicant to the problem. The rail's message sits at the
          foot of the page on a phone, so without this a stranger with one
          attempt and no support path taps Submit and sees nothing change.
        */
        const firstErrored = Object.keys(data?.fieldErrors ?? {})[0];
        if (firstErrored) {
          // Identity fields are addressed by their own name; a question's
          // control is `q-<id>`, as `QuestionField` renders it.
          const element =
            document.getElementById(firstErrored) ??
            document.getElementById(`q-${firstErrored}`);

          element?.scrollIntoView({ behavior: "smooth", block: "center" });
          // Focus after the scroll settles, so the browser does not fight it
          // with a jump of its own.
          setTimeout(() => (element as HTMLElement | null)?.focus(), 400);
        }
        return;
      }

      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch {
      setFormError(
        "We could not reach the server. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }
}

const inputClass =
  "w-full rounded-lg border border-(--file-rule) bg-white px-3 py-2 text-(--file-ink) outline-none transition-shadow placeholder:text-(--file-muted) focus-visible:border-(--file-accent) focus-visible:ring-2 focus-visible:ring-(--file-accent)/40";

/* Sized to the answer, not to the column — see `WIDTHS` in question-field. */
const NAME_WIDTH = "max-w-[26rem]";
const EMAIL_WIDTH = "max-w-[28rem]";
const PHONE_WIDTH = "max-w-[20rem]";

/**
 * A ruled band on paper, not a card. Cards inside a document would make the
 * page a dashboard; the file reads as one continuous sheet with sections
 * separated by a rule.
 */
function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-8 border-t border-(--file-rule) pt-8 first:border-t-0 first:pt-0"
    >
      <h2
        id={`${id}-heading`}
        className="text-(--file-head) text-xl font-semibold"
      >
        {title}
      </h2>
      {note ? (
        <p className="text-(--file-muted) mt-1 max-w-[68ch]">{note}</p>
      ) : null}
      <div className="divide-y divide-(--file-rule)">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  required = false,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-6">
      <label htmlFor={id} className="text-(--file-head) font-medium">
        {label}
        {required ? (
          <>
            <span className="text-(--file-required)" aria-hidden>
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      {help ? (
        <p className="text-(--file-muted) max-w-[68ch]">{help}</p>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-(--file-required)">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ContentsRow({
  href,
  label,
  done,
  total,
}: {
  href: string;
  label: string;
  done: number;
  total: number;
}) {
  const complete = total > 0 && done === total;

  return (
    <li>
      <a
        href={href}
        className="group flex items-center justify-between gap-3 rounded focus-visible:ring-2 focus-visible:ring-(--file-accent) focus-visible:outline-none"
      >
        <span className="text-(--file-ink) group-hover:underline group-hover:underline-offset-4">
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-(--file-muted) text-sm tabular-nums">
            {done}/{total}
          </span>
          {/*
            The one authored moment on the page: the mark fills as the section
            completes, on an exponential ease-out from an already-visible
            default. `motion-reduce` holds it still for anyone who asked.
          */}
          <span
            aria-hidden
            className={`flex size-4 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
              complete
                ? "scale-110 border-(--file-accent) bg-(--file-accent)"
                : "scale-100 border-(--file-rule) bg-transparent"
            }`}
          >
            <Check
              className={`size-3 text-(--file-on-accent) transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                complete ? "opacity-100" : "opacity-0"
              }`}
              strokeWidth={3}
            />
          </span>
        </span>
      </a>
    </li>
  );
}
