import { NextResponse } from "next/server";
import { apiError, serverError, validationError, writeFailure } from "@/lib/api";
import { MAX_FILE_BYTES } from "@/lib/files";
import { isAcceptingApplications, isDocument } from "@/lib/recruitment";
import {
  clientIpFrom,
  hashSubmitterIp,
  loadPublicCompany,
  loadPublicForm,
  submitApplication,
  type SubmitAnswer,
} from "@/lib/recruitment-public-data";
import {
  answerSchemaFor,
  applicantIdentitySchema,
} from "@/lib/validations/recruitment";

/**
 * POST /api/public/recruitment/[companySlug]/[formSlug] — an application.
 *
 * The only unauthenticated write in the app, so it states its own boundaries
 * rather than inheriting any:
 *
 *  - the tenant comes from the URL's company slug, resolved here, never from
 *    the body;
 *  - the questions, their types and which are required are read from the
 *    database and the answer schema is built from *those*, so the browser's
 *    opinion about what was required is irrelevant;
 *  - a honeypot field and a per-IP hourly cap absorb bulk spam;
 *  - uploads travel in this same multipart request, so there is no anonymous
 *    upload endpoint standing on its own and no orphaned file when someone
 *    abandons the page.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/public/recruitment/[companySlug]/[formSlug]">
) {
  const { companySlug, formSlug } = await context.params;

  let form: Awaited<ReturnType<typeof loadPublicForm>> = null;
  let companyId = "";

  try {
    const company = await loadPublicCompany(companySlug);
    if (!company) {
      return apiError("That company does not exist.", 404, "not_found");
    }
    companyId = company.id;

    form = await loadPublicForm(company.id, formSlug);
    if (!form) {
      return apiError("That opening does not exist.", 404, "not_found");
    }
  } catch (cause) {
    return serverError(
      { route: "POST /api/public/recruitment/[companySlug]/[formSlug]" },
      cause
    );
  }

  if (!isAcceptingApplications(form)) {
    return apiError(
      "This opening has stopped accepting applications.",
      409,
      "closed"
    );
  }

  if (form.destination === "GoogleForm") {
    return apiError(
      "This opening is answered on Google Forms.",
      409,
      "wrong_destination"
    );
  }

  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return apiError("Expected a form submission.", 400, "invalid_body");
  }

  const identity = applicantIdentitySchema.safeParse({
    fullName: body.get("fullName"),
    email: body.get("email"),
    phone: body.get("phone") ?? "",
    company: body.get("company") ?? "",
  });
  if (!identity.success) return validationError(identity.error);

  // The honeypot. A filled value means a bot; answer 200 so it learns nothing
  // from the response, and write nothing.
  if (identity.data.company) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Reject oversized uploads before reading any of them into memory, the same
  // pre-check `POST /api/files` makes.
  for (const question of form.questions) {
    if (!isDocument(question.type)) continue;

    const entry = body.get(question.id);
    if (entry instanceof File && entry.size > MAX_FILE_BYTES) {
      return apiError("That file is larger than 5 MB.", 413, "file_too_large");
    }
  }

  const raw: Record<string, unknown> = {};
  for (const question of form.questions) {
    if (isDocument(question.type)) {
      const entry = body.get(question.id);
      raw[question.id] = entry instanceof File && entry.size > 0 ? entry : null;
      continue;
    }

    raw[question.id] =
      question.type === "MultiChoice"
        ? body.getAll(question.id).map(String)
        : body.get(question.id);
  }

  const parsed = answerSchemaFor(form.questions).safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const answers: SubmitAnswer[] = [];

    for (const question of form.questions) {
      const value = parsed.data[question.id as keyof typeof parsed.data];

      if (isDocument(question.type)) {
        if (!(value instanceof File)) continue;
        answers.push({
          questionId: question.id,
          file: {
            name: value.name,
            mimeType: value.type,
            bytes: new Uint8Array(await value.arrayBuffer()),
          },
        });
        continue;
      }

      if (question.type === "MultiChoice") {
        const values = Array.isArray(value) ? value.map(String) : [];
        if (values.length === 0) continue;
        answers.push({ questionId: question.id, values });
        continue;
      }

      if (value === undefined || value === null || value === "") continue;

      answers.push({
        questionId: question.id,
        // Dates arrive as `Date` and numbers as `number` once coerced; both are
        // stored as text so one column can hold every scalar answer type.
        value: value instanceof Date ? value.toISOString() : String(value),
      });
    }

    const result = await submitApplication({
      form,
      identity: {
        fullName: identity.data.fullName,
        email: identity.data.email,
        phone: identity.data.phone || undefined,
      },
      answers,
      ipHash: hashSubmitterIp(clientIpFrom(request.headers), companyId),
    });

    if (!result.ok) return writeFailure(result);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/public/recruitment/[companySlug]/[formSlug]",
        companyId,
      },
      cause
    );
  }
}

/** Reads the request's own headers for the rate limit, so never prerendered. */
export const dynamic = "force-dynamic";
