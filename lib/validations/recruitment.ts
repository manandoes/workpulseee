import { z } from "zod";
import {
  MAX_OPTIONS_PER_QUESTION,
  MAX_QUESTIONS_PER_FORM,
  QUESTION_TYPES,
  hasOptions,
} from "@/lib/recruitment";
import type { HiringQuestionType } from "@/lib/generated/prisma/enums";

/**
 * Validation for hiring (Rules.md section 4).
 *
 * Two audiences, so two halves:
 *
 *  - the company authoring a form, whose input is a known shape;
 *  - the public answering one, whose input has no fixed shape at all. The
 *    questions are data, so the schema that checks an applicant's answers has
 *    to be *built from those questions* at request time — see
 *    `answerSchemaFor`. Anything less would mean trusting the browser about
 *    which questions were required, which is the browser's opinion, not a rule.
 */

const questionType = z.enum(QUESTION_TYPES);

export const hiringQuestionSchema = z
  .object({
    /** Client-side id for a new question; the server assigns the real one. */
    id: z.string().trim().max(60).optional(),
    type: questionType,
    label: z.string().trim().min(1, "Give this question a label").max(300),
    helpText: z.string().trim().max(500).nullish(),
    required: z.boolean().default(false),
    options: z
      .array(z.string().trim().min(1, "An empty choice cannot be picked").max(200))
      .max(MAX_OPTIONS_PER_QUESTION, "That is too many choices")
      .default([]),
  })
  // A choice question with no choices renders as a dead control, and options
  // on a text question are silently ignored data. Both are author mistakes
  // worth naming at save time rather than discovering on the public page.
  .refine(
    (question) => !hasOptions(question.type) || question.options.length >= 2,
    { message: "Give this question at least two choices", path: ["options"] }
  )
  .refine(
    (question) => hasOptions(question.type) || question.options.length === 0,
    { message: "This question type has no choices", path: ["options"] }
  )
  .refine(
    (question) =>
      !hasOptions(question.type) ||
      new Set(question.options).size === question.options.length,
    { message: "Two choices are identical", path: ["options"] }
  );

export const hiringFormSchema = z.object({
  title: z.string().trim().min(1, "Name the role you are hiring for").max(200),
  summary: z.string().trim().max(500).nullish(),
  confirmationMessage: z.string().trim().max(800).nullish(),
  team: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(120).nullish(),
  employmentType: z
    .enum(["FullTime", "PartTime", "Contract", "Intern"])
    .nullish(),
  closesAt: z.coerce.date().nullish(),
  questions: z
    .array(hiringQuestionSchema)
    .max(MAX_QUESTIONS_PER_FORM, "That is too many questions for one form"),
});

export const publishFormSchema = z.object({
  destination: z.enum(["Hosted", "GoogleForm"]),
});

export const formStatusSchema = z.object({
  status: z.enum(["Draft", "Live", "Closed"]),
});

export const updateApplicationSchema = z.object({
  stage: z
    .enum(["New", "Shortlisted", "Interview", "Offer", "Hired", "Rejected"])
    .optional(),
  /** A note is added, never edited — so this is the new note's body. */
  note: z.string().trim().min(1).max(4000).optional(),
});

/**
 * The applicant's own identity, collected by the page rather than authored by
 * the company (see the `JobApplication` model's comment on why).
 */
export const applicantIdentitySchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(150),
  email: z.email("Enter a valid email address").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+\-()\s]*$/, "Use digits, spaces, + and - only")
    .optional()
    .or(z.literal("")),
  /**
   * Honeypot. A real applicant never sees this field and so never fills it;
   * a bot that fills every input it finds does. Named plausibly on purpose —
   * `honeypot` would defeat itself.
   */
  company: z.string().max(200).optional(),
});

export type HiringFormInput = z.infer<typeof hiringFormSchema>;
export type HiringQuestionInput = z.infer<typeof hiringQuestionSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export type AnswerableQuestion = {
  id: string;
  type: HiringQuestionType;
  label: string;
  required: boolean;
  options: string[];
};

/**
 * Build the Zod schema for one specific form's answers.
 *
 * Every rule here is derived from the stored question, never from the request:
 * which questions exist, which are required, and which choices are allowed are
 * all read from the database row. A submission naming a question that is not
 * on this form is simply absent from the schema and is dropped.
 *
 * Values arrive as strings (and `File`s) because the submission is
 * `multipart/form-data` — one request carries the answers and the uploads
 * together, so there is no anonymous upload endpoint to abuse on its own and
 * no orphaned file when someone abandons the page.
 */
export function answerSchemaFor(questions: AnswerableQuestion[]) {
  const shape: Record<string, z.ZodType> = {};

  for (const question of questions) {
    shape[question.id] = fieldSchema(question);
  }

  return z.object(shape);
}

function fieldSchema(question: AnswerableQuestion): z.ZodType {
  const requiredMessage = `${question.label} is required`;

  switch (question.type) {
    case "MultiChoice": {
      const allowed = z.enum(question.options as [string, ...string[]]);
      const base = z.array(allowed);
      return question.required
        ? base.min(1, requiredMessage)
        : base.default([]);
    }

    case "SingleChoice":
    case "Dropdown": {
      const allowed = z.enum(question.options as [string, ...string[]]);
      return question.required ? allowed : allowed.nullish();
    }

    case "Document": {
      // Type and size are enforced in `lib/files-data.ts`'s `storeFile`, which
      // is the only thing that can enforce them — the browser's `accept` is a
      // suggestion. Here we only insist that a required upload is present.
      const base = z.instanceof(File);
      return question.required
        ? base.refine((file) => file.size > 0, requiredMessage)
        : base.nullish();
    }

    case "Email": {
      const base = z.email("Enter a valid email address").max(200);
      return question.required ? base : optionalText(base);
    }

    case "Number": {
      const base = z.coerce.number("Enter a number");
      return question.required ? base : optionalText(base);
    }

    case "Date": {
      const base = z.coerce.date("Enter a valid date");
      return question.required ? base : optionalText(base);
    }

    case "Phone": {
      const base = z
        .string()
        .trim()
        .max(40)
        .regex(/^[0-9+\-()\s]+$/, "Use digits, spaces, + and - only");
      return question.required ? base.min(1, requiredMessage) : optionalText(base);
    }

    case "LongText": {
      const base = z.string().trim().max(5000);
      return question.required
        ? base.min(1, requiredMessage)
        : optionalText(base);
    }

    case "ShortText":
    default: {
      const base = z.string().trim().max(500);
      return question.required
        ? base.min(1, requiredMessage)
        : optionalText(base);
    }
  }
}

/**
 * An optional field that an empty or absent answer satisfies.
 *
 * Both spellings of "not answered" have to pass, because both really arrive:
 * a browser submits every text input it renders, so an untouched optional
 * question comes through as `""`, while `FormData.get()` returns `null` for a
 * field the page never rendered at all. Plain `.optional()` accepts neither,
 * which would fail the whole submission over a question the applicant was
 * explicitly told they could skip.
 */
function optionalText(inner: z.ZodType): z.ZodType {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    inner.optional()
  );
}
