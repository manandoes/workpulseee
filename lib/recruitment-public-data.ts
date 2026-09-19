import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { storeAnonymousFile } from "@/lib/files-data";
import type { WriteFailure } from "@/lib/api";
import {
  RATE_LIMIT_WINDOW_MS,
  SUBMISSIONS_PER_IP_PER_HOUR,
  isAcceptingApplications,
} from "@/lib/recruitment";
import type { HiringQuestionType } from "@/lib/generated/prisma/enums";

/**
 * The unauthenticated applicant path (Plan: hiring).
 *
 * Deliberately a separate module from `lib/recruitment-data.ts`. Everything
 * there takes a `SessionActor` and scopes by it; nothing here has one. Keeping
 * the two apart means the company-side helpers cannot be reached from a public
 * route by accident, and every function below has to state its own tenant
 * boundary out loud — which is the company slug in the URL, resolved once,
 * here, and never taken from the request body.
 *
 * What is returned to the public is also narrower on purpose: a form's row
 * carries `googleFormId`, `createdById` and its applicant list, and none of
 * that belongs in a page a stranger can open.
 */

export type PublicQuestion = {
  id: string;
  type: HiringQuestionType;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string[];
};

export type PublicForm = {
  id: string;
  companyId: string;
  title: string;
  slug: string;
  summary: string | null;
  confirmationMessage: string | null;
  team: string | null;
  location: string | null;
  employmentType: "FullTime" | "PartTime" | "Contract" | "Intern" | null;
  status: "Draft" | "Live" | "Closed";
  destination: "Hosted" | "GoogleForm";
  googleResponderUrl: string | null;
  publishedAt: Date | null;
  closesAt: Date | null;
  questions: PublicQuestion[];
};

export type PublicCompany = {
  id: string;
  name: string;
  slug: string;
  brandColor: string;
};

/** The company behind a `/{companySlug}/...` URL, or null. */
export async function loadPublicCompany(
  companySlug: string
): Promise<PublicCompany | null> {
  return db.company.findFirst({
    where: { slug: companySlug, deletedAt: null },
    select: { id: true, name: true, slug: true, brandColor: true },
  });
}

/**
 * Every form a stranger is allowed to know exists: published ones only.
 *
 * `Closed` forms are included so a candidate following an old link lands on the
 * opening and is told it closed, rather than on a 404 that reads as a broken
 * company.
 */
export async function loadPublicForms(companyId: string): Promise<PublicForm[]> {
  return db.hiringForm.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: ["Live", "Closed"] },
    },
    orderBy: [{ status: "asc" }, { publishedAt: "desc" }],
    select: publicFormSelect,
  });
}

/** One published form by its slug, within one company. */
export async function loadPublicForm(
  companyId: string,
  formSlug: string
): Promise<PublicForm | null> {
  return db.hiringForm.findFirst({
    where: {
      companyId,
      slug: formSlug,
      deletedAt: null,
      status: { in: ["Live", "Closed"] },
    },
    select: publicFormSelect,
  });
}

const publicFormSelect = {
  id: true,
  companyId: true,
  title: true,
  slug: true,
  summary: true,
  confirmationMessage: true,
  team: true,
  location: true,
  employmentType: true,
  status: true,
  destination: true,
  googleResponderUrl: true,
  publishedAt: true,
  closesAt: true,
  questions: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      type: true,
      label: true,
      helpText: true,
      required: true,
      options: true,
    },
  },
} as const;

/**
 * A one-way, per-company fingerprint of the submitting address.
 *
 * Salted with the company id so the same address produces a different hash for
 * each company — the value can rate-limit, and nothing else. The raw address
 * is never stored: this feature has no use for it, and an applicant did not
 * agree to be logged by IP for applying to a job.
 */
export function hashSubmitterIp(ip: string, companyId: string): string {
  return createHash("sha256").update(`${companyId}:${ip}`).digest("hex");
}

/**
 * Best-effort client address behind a proxy.
 *
 * `x-forwarded-for` is client-controllable, so a determined attacker can spoof
 * it and defeat the rate limit. That is understood and accepted: this is a
 * speed bump against bulk spam, not an authorization control, and nothing on
 * the other side of it is privileged. The honeypot and server-side validation
 * carry the rest.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export type SubmitAnswer = {
  questionId: string;
  value?: string | null;
  values?: string[];
  file?: { name: string; mimeType: string; bytes: Uint8Array } | null;
};

export type SubmitResult =
  | { ok: true; applicationId: string }
  | WriteFailure;

/**
 * Record one application.
 *
 * The form is re-read and re-checked here rather than trusted from the caller:
 * a form can close between the page render and the submit, and the applicant's
 * browser has no way to know. `isAcceptingApplications` is the same function
 * the page used to decide whether to show the button, so the two cannot drift.
 */
export async function submitApplication(input: {
  form: PublicForm;
  identity: { fullName: string; email: string; phone?: string };
  answers: SubmitAnswer[];
  ipHash: string;
}): Promise<SubmitResult> {
  const form = await db.hiringForm.findFirst({
    where: { id: input.form.id, deletedAt: null },
    select: { id: true, companyId: true, status: true, closesAt: true },
  });

  if (!form) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "This opening is no longer available.",
    };
  }

  if (!isAcceptingApplications(form)) {
    return {
      ok: false,
      status: 409,
      code: "closed",
      message: "This opening has stopped accepting applications.",
    };
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await db.jobApplication.count({
    where: {
      companyId: form.companyId,
      submitterIpHash: input.ipHash,
      submittedAt: { gte: since },
    },
  });

  if (recent >= SUBMISSIONS_PER_IP_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message:
        "That is a lot of applications from one place in an hour. Try again later, or email us directly.",
    };
  }

  // Files are stored before the application row so a rejected upload (wrong
  // type, too large) fails the whole submission rather than leaving a saved
  // application with a silently missing CV.
  const storedFiles = new Map<string, string>();
  for (const answer of input.answers) {
    if (!answer.file) continue;

    const stored = await storeAnonymousFile(form.companyId, answer.file);
    if (!stored.ok) return stored;

    storedFiles.set(answer.questionId, stored.file.id);
  }

  const application = await db.jobApplication.create({
    data: {
      companyId: form.companyId,
      formId: form.id,
      fullName: input.identity.fullName,
      email: input.identity.email,
      phone: input.identity.phone || null,
      source: "Hosted",
      submitterIpHash: input.ipHash,
      answers: {
        create: input.answers.map((answer) => ({
          companyId: form.companyId,
          questionId: answer.questionId,
          value: answer.value ?? null,
          values: answer.values ?? [],
          fileId: storedFiles.get(answer.questionId) ?? null,
        })),
      },
    },
    select: { id: true },
  });

  return { ok: true, applicationId: application.id };
}
