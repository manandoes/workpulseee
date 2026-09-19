import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { duplicateFailure, type WriteFailure } from "@/lib/api";
import { slugify, uniqueSlug } from "@/lib/slug";
import type {
  ApplicationStage,
  HiringFormDestination,
  HiringFormStatus,
  HiringQuestionType,
} from "@/lib/generated/prisma/enums";
import type { HiringFormInput } from "@/lib/validations/recruitment";

/**
 * Database access for hiring (Plan: hiring), company side.
 *
 * Every read goes through `scopedWhere` — an applicant's CV and phone number
 * are exactly the kind of row a forgotten tenant filter must never leak
 * (Rules.md section 2). The unauthenticated applicant path deliberately lives
 * in `lib/recruitment-public-data.ts` instead: it has no `SessionActor` to
 * scope by, so keeping it in a separate module means nothing here can be
 * called without one by accident.
 */

export type HiringFormListItem = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  team: string | null;
  location: string | null;
  status: HiringFormStatus;
  destination: HiringFormDestination;
  googleResponderUrl: string | null;
  publishedAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  questionCount: number;
  applicantCount: number;
  newApplicantCount: number;
};

/**
 * Every form in the company, newest first, with the two counts the list needs.
 *
 * The counts come back with the rows rather than as follow-up queries: a
 * hiring list is a handful of rows, and one round trip that answers the whole
 * page beats N+1 over something this small.
 */
export async function loadHiringForms(
  actor: SessionActor
): Promise<HiringFormListItem[]> {
  const forms = await db.hiringForm.findMany({
    where: scopedWhere(actor),
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      team: true,
      location: true,
      status: true,
      destination: true,
      googleResponderUrl: true,
      publishedAt: true,
      closesAt: true,
      createdAt: true,
      _count: { select: { questions: true, applications: true } },
      applications: { where: { stage: "New" }, select: { id: true } },
    },
  });

  return forms.map(({ _count, applications, ...form }) => ({
    ...form,
    questionCount: _count.questions,
    applicantCount: _count.applications,
    newApplicantCount: applications.length,
  }));
}

export type HiringFormDetail = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  confirmationMessage: string | null;
  team: string | null;
  location: string | null;
  employmentType: "FullTime" | "PartTime" | "Contract" | "Intern" | null;
  status: HiringFormStatus;
  destination: HiringFormDestination;
  googleFormId: string | null;
  googleResponderUrl: string | null;
  googleEditUrl: string | null;
  googleSyncedAt: Date | null;
  publishedAt: Date | null;
  closesAt: Date | null;
  questions: {
    id: string;
    order: number;
    type: HiringQuestionType;
    label: string;
    helpText: string | null;
    required: boolean;
    options: string[];
  }[];
};

/** One form with its questions, or null when it is not this company's. */
export async function loadHiringForm(
  actor: SessionActor,
  formId: string
): Promise<HiringFormDetail | null> {
  return db.hiringForm.findFirst({
    where: scopedWhere(actor, { id: formId }),
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      confirmationMessage: true,
      team: true,
      location: true,
      employmentType: true,
      status: true,
      destination: true,
      googleFormId: true,
      googleResponderUrl: true,
      googleEditUrl: true,
      googleSyncedAt: true,
      publishedAt: true,
      closesAt: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          label: true,
          helpText: true,
          required: true,
          options: true,
        },
      },
    },
  });
}

export type SaveFormResult = { ok: true; formId: string } | WriteFailure;

/**
 * Create a form, deriving its public URL segment from the role title.
 *
 * The slug is assigned once, at creation, and never follows a later retitle:
 * a live form's URL has been sent to candidates, and silently moving it would
 * break every link already in the wild.
 */
export async function createHiringForm(
  actor: SessionActor,
  input: HiringFormInput
): Promise<SaveFormResult> {
  const slug = await uniqueSlug(input.title, async (candidate) => {
    const existing = await db.hiringForm.findFirst({
      where: { companyId: actor.companyId, slug: candidate },
      select: { id: true },
    });
    return existing !== null;
  });

  const form = await db.hiringForm.create({
    data: {
      companyId: actor.companyId,
      title: input.title,
      slug,
      summary: input.summary ?? null,
      confirmationMessage: input.confirmationMessage ?? null,
      team: input.team ?? null,
      location: input.location ?? null,
      employmentType: input.employmentType ?? null,
      closesAt: input.closesAt ?? null,
      createdById: actor.accountType === "company" ? actor.id : null,
      questions: {
        create: input.questions.map((question, order) => ({
          companyId: actor.companyId,
          order,
          type: question.type,
          label: question.label,
          helpText: question.helpText ?? null,
          required: question.required,
          options: question.options,
        })),
      },
    },
    select: { id: true },
  });

  return { ok: true, formId: form.id };
}

/**
 * Replace a form's details and its whole question list.
 *
 * Questions are rewritten wholesale rather than diffed, which keeps `order`
 * gapless and the write trivially correct. The cost is real and accepted: an
 * edit re-creates question rows, so answers already collected against the old
 * rows are cascade-deleted with them. That is why `editableAfterPublish`
 * refuses the whole operation once applications exist — the destructive case
 * is blocked rather than papered over.
 */
export async function updateHiringForm(
  actor: SessionActor,
  formId: string,
  input: HiringFormInput
): Promise<SaveFormResult> {
  const form = await db.hiringForm.findFirst({
    where: scopedWhere(actor, { id: formId }),
    select: { id: true, _count: { select: { applications: true } } },
  });

  if (!form) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That form does not exist.",
    };
  }

  if (form._count.applications > 0) {
    return {
      ok: false,
      status: 409,
      code: "has_applications",
      message:
        "This form already has applications, so its questions are locked. Close it and create a new one to change them.",
    };
  }

  await db.$transaction([
    db.hiringQuestion.deleteMany({ where: { formId, companyId: actor.companyId } }),
    db.hiringForm.update({
      where: { id: formId },
      data: {
        title: input.title,
        summary: input.summary ?? null,
        confirmationMessage: input.confirmationMessage ?? null,
        team: input.team ?? null,
        location: input.location ?? null,
        employmentType: input.employmentType ?? null,
        closesAt: input.closesAt ?? null,
        questions: {
          create: input.questions.map((question, order) => ({
            companyId: actor.companyId,
            order,
            type: question.type,
            label: question.label,
            helpText: question.helpText ?? null,
            required: question.required,
            options: question.options,
          })),
        },
      },
    }),
  ]);

  return { ok: true, formId };
}

/** Flip a form between Draft, Live and Closed. */
export async function setFormStatus(
  actor: SessionActor,
  formId: string,
  status: HiringFormStatus
): Promise<SaveFormResult> {
  const updated = await db.hiringForm.updateMany({
    where: scopedWhere(actor, { id: formId }),
    data: {
      status,
      publishedAt: status === "Live" ? new Date() : undefined,
    },
  });

  if (updated.count === 0) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That form does not exist.",
    };
  }

  return { ok: true, formId };
}

/** Soft-delete, matching every other module's `deletedAt` convention. */
export async function deleteHiringForm(
  actor: SessionActor,
  formId: string
): Promise<SaveFormResult> {
  const deleted = await db.hiringForm.updateMany({
    where: scopedWhere(actor, { id: formId }),
    data: { deletedAt: new Date() },
  });

  if (deleted.count === 0) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That form does not exist.",
    };
  }

  return { ok: true, formId };
}

export type ApplicantListItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  stage: ApplicationStage;
  source: HiringFormDestination;
  submittedAt: Date;
  noteCount: number;
};

/** Every applicant on one form, newest first. */
export async function loadApplicants(
  actor: SessionActor,
  formId: string
): Promise<ApplicantListItem[]> {
  const applications = await db.jobApplication.findMany({
    where: { companyId: actor.companyId, formId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      stage: true,
      source: true,
      submittedAt: true,
      _count: { select: { notes: true } },
    },
  });

  return applications.map(({ _count, ...application }) => ({
    ...application,
    noteCount: _count.notes,
  }));
}

export type ApplicantDetail = {
  id: string;
  formId: string;
  formTitle: string;
  fullName: string;
  email: string;
  phone: string | null;
  stage: ApplicationStage;
  source: HiringFormDestination;
  submittedAt: Date;
  answers: {
    questionId: string;
    label: string;
    type: HiringQuestionType;
    order: number;
    value: string | null;
    values: string[];
    file: { id: string; name: string; sizeBytes: number } | null;
  }[];
  notes: {
    id: string;
    body: string;
    createdAt: Date;
    authorName: string;
  }[];
};

/** One applicant's whole file, or null when it is not this company's. */
export async function loadApplicant(
  actor: SessionActor,
  applicationId: string
): Promise<ApplicantDetail | null> {
  const application = await db.jobApplication.findFirst({
    where: { id: applicationId, companyId: actor.companyId },
    select: {
      id: true,
      formId: true,
      fullName: true,
      email: true,
      phone: true,
      stage: true,
      source: true,
      submittedAt: true,
      form: { select: { title: true } },
      answers: {
        select: {
          questionId: true,
          value: true,
          values: true,
          file: { select: { id: true, name: true, sizeBytes: true } },
          question: { select: { label: true, type: true, order: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { fullName: true } },
          authorEmployee: { select: { fullName: true } },
        },
      },
    },
  });

  if (!application) return null;

  return {
    id: application.id,
    formId: application.formId,
    formTitle: application.form.title,
    fullName: application.fullName,
    email: application.email,
    phone: application.phone,
    stage: application.stage,
    source: application.source,
    submittedAt: application.submittedAt,
    answers: application.answers
      .map((answer) => ({
        questionId: answer.questionId,
        label: answer.question.label,
        type: answer.question.type,
        order: answer.question.order,
        value: answer.value,
        values: answer.values,
        file: answer.file,
      }))
      // Read in the order the applicant answered them, not the order the rows
      // happened to come back in.
      .sort((a, b) => a.order - b.order),
    notes: application.notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt,
      authorName:
        note.author?.fullName ?? note.authorEmployee?.fullName ?? "Someone",
    })),
  };
}

export type UpdateApplicantResult = { ok: true } | WriteFailure;

/** Move an applicant along the pipeline and/or leave an internal note. */
export async function updateApplicant(
  actor: SessionActor,
  applicationId: string,
  input: { stage?: ApplicationStage; note?: string }
): Promise<UpdateApplicantResult> {
  const application = await db.jobApplication.findFirst({
    where: { id: applicationId, companyId: actor.companyId },
    select: { id: true },
  });

  if (!application) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That applicant does not exist.",
    };
  }

  const writes = [];

  if (input.stage) {
    writes.push(
      db.jobApplication.update({
        where: { id: applicationId },
        data: { stage: input.stage },
      })
    );
  }

  if (input.note) {
    writes.push(
      db.applicationNote.create({
        data: {
          companyId: actor.companyId,
          applicationId,
          body: input.note,
          ...(actor.accountType === "employee"
            ? { authorEmployeeId: actor.id }
            : { authorId: actor.id }),
        },
      })
    );
  }

  if (writes.length > 0) await db.$transaction(writes);

  return { ok: true };
}

/**
 * Is this slug still free for a *new* form in this company?
 *
 * Exposed so the builder can warn before saving rather than after; the
 * uniqueness that actually holds is the `@@unique([companyId, slug])` the
 * database enforces.
 */
export async function slugAvailable(
  actor: SessionActor,
  candidate: string
): Promise<boolean> {
  const normalized = slugify(candidate);
  if (!normalized) return false;

  const existing = await db.hiringForm.findFirst({
    where: { companyId: actor.companyId, slug: normalized },
    select: { id: true },
  });

  return existing === null;
}

/** Surfaced by the routes when a slug collides despite the check above. */
export const slugTaken = () =>
  duplicateFailure("title", "A form with that URL already exists.");
