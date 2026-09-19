import type {
  ApplicationStage,
  HiringFormStatus,
  HiringQuestionType,
} from "@/lib/generated/prisma/enums";

/**
 * Hiring rules (Plan: hiring).
 *
 * Pure and dependency-free — no Prisma, no `node:crypto`, no React — so the
 * public applicant page, the dashboard builder, the API routes and the unit
 * tests can all import the same vocabulary. The same split `lib/files.ts` uses
 * against `lib/files-data.ts`.
 */

/** Ordered as the builder lists them: the common types first. */
export const QUESTION_TYPES = [
  "ShortText",
  "LongText",
  "SingleChoice",
  "MultiChoice",
  "Dropdown",
  "Email",
  "Phone",
  "Number",
  "Date",
  "Document",
] as const satisfies readonly HiringQuestionType[];

export const QUESTION_TYPE_LABELS: Record<HiringQuestionType, string> = {
  ShortText: "Short answer",
  LongText: "Long answer",
  SingleChoice: "Multiple choice",
  MultiChoice: "Checkboxes",
  Dropdown: "Dropdown",
  Email: "Email address",
  Phone: "Phone number",
  Number: "Number",
  Date: "Date",
  Document: "Document upload",
};

/** What the builder tells the author this type will do to their form. */
export const QUESTION_TYPE_HINTS: Record<HiringQuestionType, string> = {
  ShortText: "One line of text.",
  LongText: "A paragraph box that grows as they type.",
  SingleChoice: "Radio buttons — exactly one answer.",
  MultiChoice: "Checkboxes — any number of answers.",
  Dropdown: "A select menu — best past about seven choices.",
  Email: "Validated as an email address.",
  Phone: "Digits, spaces and + only.",
  Number: "Validated as a number.",
  Date: "A date picker.",
  Document: "One file, up to 5 MB.",
};

/** The three types whose answers come from a list the author writes. */
export function hasOptions(type: HiringQuestionType): boolean {
  return (
    type === "SingleChoice" || type === "MultiChoice" || type === "Dropdown"
  );
}

/** The only type that produces a `StoredFile`. */
export function isDocument(type: HiringQuestionType): boolean {
  return type === "Document";
}

/** Pipeline order, left to right. `Hired` and `Rejected` are both terminal. */
export const APPLICATION_STAGES = [
  "New",
  "Shortlisted",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
] as const satisfies readonly ApplicationStage[];

/**
 * How many applications one IP may submit to one company per hour.
 *
 * Generous enough that a household or a co-working NAT does not lock out real
 * applicants, low enough that a script cannot fill the pipeline. Enforced in
 * `lib/recruitment-public-data.ts`, which is the only place it can be, since
 * a client-side check protects nothing.
 */
export const SUBMISSIONS_PER_IP_PER_HOUR = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const MAX_QUESTIONS_PER_FORM = 60;
export const MAX_OPTIONS_PER_QUESTION = 30;

/**
 * Whether a form would accept a submission right now.
 *
 * `Live` is not sufficient on its own — a form with a passed `closesAt` is
 * still `Live` but must refuse, which is exactly what lets a company set a
 * deadline and then forget about it. The public page and the submit route call
 * this same function, so the button and the server can never disagree.
 */
export function isAcceptingApplications(
  form: { status: HiringFormStatus; closesAt: Date | null },
  now: Date = new Date()
): boolean {
  if (form.status !== "Live") return false;
  if (form.closesAt && form.closesAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Why a form is not accepting, phrased for the applicant reading the page. */
export function closedReason(
  form: { status: HiringFormStatus; closesAt: Date | null },
  now: Date = new Date()
): string | null {
  if (isAcceptingApplications(form, now)) return null;
  if (form.status === "Draft") return "This opening is not open yet.";
  if (form.closesAt && form.closesAt.getTime() <= now.getTime()) {
    return "Applications for this opening have closed.";
  }
  return "This opening is no longer accepting applications.";
}

export type AnsweredCount = { answered: number; required: number };

/**
 * How much of the file is filled in, for the contents rail on the public page.
 *
 * Counts only *required* questions: telling an applicant they are "6 of 20
 * done" when fourteen of those are optional is how a form talks someone out of
 * submitting.
 */
export function completeness(
  questions: { id: string; required: boolean }[],
  answers: Record<string, unknown>
): AnsweredCount {
  const required = questions.filter((question) => question.required);
  const answered = required.filter((question) =>
    isAnswered(answers[question.id])
  );
  return { answered: answered.length, required: required.length };
}

/**
 * Black or white text for a company's own brand color.
 *
 * The public applicant page is painted with `Company.brandColor`, which an
 * Owner picked from a color input with no contrast check attached. Inside the
 * dashboard that only ever tints an accent among known-good neutrals; on a
 * page a stranger reads on an unknown screen it carries the primary action, so
 * the foreground has to be derived rather than assumed.
 *
 * WCAG relative luminance, with the 0.179 threshold that maximises the worse
 * of the two contrast ratios — the same arithmetic Design.md § 10 records for
 * the palette, applied to a color that is not known until runtime.
 */
export function readableTextOn(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;

  const channel = (offset: number) => {
    const srgb = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);

  // Deep brown-black rather than pure black, so a light brand color still
  // lands in the product's own palette (Design.md § 3).
  return luminance > 0.179 ? "#2E2317" : "#FFFFFF";
}

/** An answer is present when it is a non-empty scalar or a non-empty list. */
export function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof File) return value.size > 0;
  return true;
}
