"use client";

import { Paperclip, X } from "lucide-react";
import { MAX_FILE_BYTES, formatFileSize } from "@/lib/files";
import type { PublicQuestion } from "@/lib/recruitment-public-data";

/**
 * One question on the public application file (Plan: hiring).
 *
 * Every control is a native form control — this page is answered by strangers
 * on unknown devices with unknown assistive technology, and a hand-rolled
 * combobox is exactly the kind of cleverness that loses someone an
 * application. The styling is the design; the behaviour is the platform's.
 *
 * The document field deliberately is not a dashed drop-zone rectangle. An
 * attachment on this page is a named item docked into the file, the way it
 * will appear to the reviewer, with its real size.
 */
/** A chevron drawn in the page's own ink, for the select control. */
const CHEVRON =
  "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22%234A3A2C%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M4 6l4 4 4-4%22/></svg>')]";

/**
 * The attachment control's width, sized with its neighbours in `WIDTHS`.
 * It lives here rather than in that map because the control's real `<input>`
 * is `sr-only` — the width has to land on the visible wrapper.
 */
const DOCUMENT_WIDTH = "max-w-[34rem]";

/** The coarse kind of an attachment, for the docked item's label. */
function fileKind(file: File): string {
  const subtype = file.type.split("/")[1] ?? "";
  if (file.type.startsWith("image/")) return "Image";
  if (subtype.includes("pdf")) return "PDF";
  if (subtype.includes("word") || subtype.includes("document")) return "Doc";
  if (subtype.includes("sheet") || subtype.includes("excel")) return "Sheet";
  if (file.type.startsWith("text/")) return "Text";
  return "File";
}

export function QuestionField({
  question,
  value,
  file,
  error,
  onChange,
  onFile,
  onFileRejected,
}: {
  question: PublicQuestion;
  value: string | string[] | undefined;
  file: File | null;
  error: string | undefined;
  onChange: (value: string | string[]) => void;
  onFile: (file: File | null) => void;
  onFileRejected: (message: string) => void;
}) {
  const id = `q-${question.id}`;
  const describedBy = [
    question.helpText ? `${id}-help` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Radios and checkboxes are a group, named by their own <legend>; pointing a
  // <label for> at a fieldset would name nothing at all.
  const grouped =
    question.type === "SingleChoice" || question.type === "MultiChoice";

  const heading = (
    <>
      {question.label}
      {question.required ? (
        <span className="text-(--file-required)" aria-hidden>
          {" "}
          *
        </span>
      ) : null}
      {question.required ? <span className="sr-only"> (required)</span> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-2 py-6">
      {grouped ? (
        <p className="font-medium text-(--file-head)">{heading}</p>
      ) : (
        <label htmlFor={id} className="font-medium text-(--file-head)">
          {heading}
        </label>
      )}

      {question.helpText ? (
        <p id={`${id}-help`} className="text-(--file-muted) max-w-[68ch]">
          {question.helpText}
        </p>
      ) : null}

      {renderControl()}

      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-(--file-required)"
        >
          {error}
        </p>
      ) : null}
    </div>
  );

  function renderControl() {
    /*
      A control sized to the answer it holds, not to the column. A date field
      stretched to 680px reads as a generic form; on a document, the width of
      the box is itself a hint about what belongs in it.
    */
    const WIDTHS: Partial<Record<PublicQuestion["type"], string>> = {
      Date: "max-w-[13rem]",
      Number: "max-w-[13rem]",
      Phone: "max-w-[20rem]",
      Email: "max-w-[28rem]",
      Dropdown: "max-w-[28rem]",
      ShortText: "max-w-[34rem]",
    };

    /*
      Document is deliberately absent from the map above. Its real input is
      `sr-only`, so a width there would style something nobody can see; the
      class belongs on the visible wrapper instead, which is what
      `DOCUMENT_WIDTH` below is applied to in both of that control's states.
    */

    const shared = {
      id,
      name: question.id,
      "aria-describedby": describedBy || undefined,
      "aria-invalid": error ? true : undefined,
      className: `w-full rounded-lg border border-(--file-rule) bg-white px-3 py-2 text-(--file-ink) outline-none transition-shadow placeholder:text-(--file-muted) focus-visible:border-(--file-accent) focus-visible:ring-2 focus-visible:ring-(--file-accent)/40 ${WIDTHS[question.type] ?? ""}`,
    };

    switch (question.type) {
      case "LongText":
        return (
          <textarea
            {...shared}
            rows={6}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );

      case "Dropdown":
        return (
          <select
            {...shared}
            // The platform chevron belongs to no design system, so it is
            // replaced with one drawn from this page's own ink.
            className={`${shared.className} appearance-none bg-size-[1rem] bg-position-[right_0.75rem_center] bg-no-repeat pr-10 ${CHEVRON}`}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Choose one…</option>
            {question.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case "SingleChoice":
        return (
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={describedBy || undefined}
          >
            <legend className="sr-only">{question.label}</legend>
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="size-4 accent-(--file-accent)"
                />
                <span className="text-(--file-ink)">{option}</span>
              </label>
            ))}
          </fieldset>
        );

      case "MultiChoice": {
        const picked = Array.isArray(value) ? value : [];
        return (
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={describedBy || undefined}
          >
            <legend className="sr-only">{question.label}</legend>
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  name={question.id}
                  value={option}
                  checked={picked.includes(option)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...picked, option]
                        : picked.filter((entry) => entry !== option)
                    )
                  }
                  className="size-4 accent-(--file-accent)"
                />
                <span className="text-(--file-ink)">{option}</span>
              </label>
            ))}
          </fieldset>
        );
      }

      case "Document":
        return file ? (
          <div
            className={`flex items-center gap-3 rounded-lg border border-(--file-rule) bg-white px-3 py-2.5 ${DOCUMENT_WIDTH}`}
          >
            <Paperclip
              aria-hidden
              className="size-4 shrink-0 text-(--file-muted)"
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate text-(--file-ink)">
              {file.name}
            </span>
            <span className="text-(--file-muted) shrink-0 tabular-nums">
              {fileKind(file)} · {formatFileSize(file.size)}
            </span>
            <button
              type="button"
              onClick={() => onFile(null)}
              aria-label={`Remove ${file.name}`}
              className="rounded p-1 text-(--file-muted) transition-colors hover:text-(--file-ink) focus-visible:ring-2 focus-visible:ring-(--file-accent) focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          /*
            A drawn control, not the browser's. The native file input ships
            "Choose File / No file chosen" in the platform's own type and
            chrome, which is the one element on this page that would announce
            it was assembled rather than designed. The input itself is still
            the real one underneath — only its rendering is ours.
          */
          <label
            htmlFor={id}
            className={`flex w-full cursor-pointer flex-col items-start gap-2 rounded-lg border border-(--file-rule) bg-white px-3 py-2.5 transition-colors hover:border-(--file-accent) focus-within:border-(--file-accent) focus-within:ring-2 focus-within:ring-(--file-accent)/40 sm:flex-row sm:items-center sm:gap-3 ${DOCUMENT_WIDTH}`}
          >
            <span className="shrink-0 rounded-md bg-(--file-accent) px-3 py-1.5 font-medium whitespace-nowrap text-(--file-on-accent)">
              Choose a file
            </span>
            <span className="text-(--file-muted) min-w-0">
              PDF, image or document, up to 5 MB
            </span>
            <input
              {...shared}
              type="file"
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                if (picked && picked.size > MAX_FILE_BYTES) {
                  // Caught here as well as on the server so an applicant on a
                  // slow connection is told before uploading, not after.
                  onFile(null);
                  event.target.value = "";
                  onFileRejected("That file is larger than 5 MB.");
                  return;
                }
                onFile(picked);
              }}
            />
          </label>
        );

      case "Date":
        return (
          <input
            {...shared}
            type="date"
            // Tints the native calendar glyph to the page's ink instead of
            // leaving it at the browser's default near-black.
            className={`${shared.className} [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100`}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );

      case "Number":
        return (
          <input
            {...shared}
            type="number"
            inputMode="decimal"
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );

      case "Email":
        return (
          <input
            {...shared}
            type="email"
            autoComplete="email"
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );

      case "Phone":
        return (
          <input
            {...shared}
            type="tel"
            autoComplete="tel"
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );

      default:
        return (
          <input
            {...shared}
            type="text"
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
    }
  }
}
