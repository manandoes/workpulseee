import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import type { WriteFailure } from "@/lib/api";
import {
  decryptRefreshToken,
  encryptRefreshToken,
} from "@/lib/google-calendar-crypto";
import {
  IDENTITY_QUESTIONS,
  createGoogleForm,
  googleFormsConfigured,
  listGoogleResponses,
} from "@/lib/google-forms";

/**
 * The company's Google Forms connection and the two operations it enables:
 * publishing a form to Google, and pulling responses back (Plan: hiring).
 *
 * Kept out of `lib/recruitment-data.ts` so the hosted destination — which is
 * the default and needs no Google account at all — does not drag the
 * integration into every import of the hiring module.
 */

export type FormsConnectionSummary = {
  googleEmail: string;
  connectedAt: Date;
  connectedByName: string | null;
};

/** What the settings UI may know: never the token. */
export async function loadFormsConnection(
  companyId: string
): Promise<FormsConnectionSummary | null> {
  const connection = await db.googleFormsConnection.findUnique({
    where: { companyId },
    select: {
      googleEmail: true,
      connectedAt: true,
      connectedBy: { select: { fullName: true } },
    },
  });

  if (!connection) return null;

  return {
    googleEmail: connection.googleEmail,
    connectedAt: connection.connectedAt,
    connectedByName: connection.connectedBy?.fullName ?? null,
  };
}

/**
 * The decrypted refresh token, for server-side API calls only.
 *
 * Never returned to a client by any route — `loadFormsConnection` above is
 * what the UI gets. Separated into its own function so that rule is visible at
 * every call site rather than depending on a caller remembering to omit a
 * field.
 */
async function refreshTokenFor(companyId: string): Promise<string | null> {
  const connection = await db.googleFormsConnection.findUnique({
    where: { companyId },
    select: { refreshTokenEncrypted: true },
  });

  if (!connection) return null;

  try {
    return decryptRefreshToken(connection.refreshTokenEncrypted);
  } catch (cause) {
    console.error("[google-forms] Stored refresh token could not be read", {
      companyId,
      cause,
    });
    return null;
  }
}

/** Store (or replace) the company's connection after a successful consent. */
export async function saveFormsConnection(input: {
  companyId: string;
  connectedById: string | null;
  googleEmail: string;
  refreshToken: string;
  scope: string;
}): Promise<void> {
  const refreshTokenEncrypted = encryptRefreshToken(input.refreshToken);

  await db.googleFormsConnection.upsert({
    where: { companyId: input.companyId },
    create: {
      companyId: input.companyId,
      connectedById: input.connectedById,
      googleEmail: input.googleEmail,
      refreshTokenEncrypted,
      scope: input.scope,
    },
    update: {
      connectedById: input.connectedById,
      googleEmail: input.googleEmail,
      refreshTokenEncrypted,
      scope: input.scope,
      connectedAt: new Date(),
    },
  });
}

export async function deleteFormsConnection(companyId: string): Promise<void> {
  await db.googleFormsConnection.deleteMany({ where: { companyId } });
}

export type PublishResult =
  | {
      ok: true;
      responderUrl: string;
      editUrl: string;
      /** Labels Google could not take as uploads — surfaced to the user. */
      downgradedDocuments: string[];
    }
  | WriteFailure;

/**
 * Create the real Google Form for a WorkPulse form and go live.
 *
 * Refuses to re-create one that already exists: a second Google Form for the
 * same opening would split the applicants across two response sets, and the
 * first URL has already been sent to candidates.
 */
export async function publishToGoogle(
  actor: SessionActor,
  formId: string
): Promise<PublishResult> {
  if (!googleFormsConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "google_not_configured",
      message:
        "Google Forms is not configured on this deployment. Publish to the WorkPulse-hosted page instead.",
    };
  }

  const form = await db.hiringForm.findFirst({
    where: scopedWhere(actor, { id: formId }),
    select: {
      id: true,
      title: true,
      summary: true,
      googleFormId: true,
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
    },
  });

  if (!form) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "That form does not exist.",
    };
  }

  if (form.googleFormId) {
    return {
      ok: false,
      status: 409,
      code: "already_published",
      message: "This form already has a Google Form. Open it to make changes.",
    };
  }

  const refreshToken = await refreshTokenFor(actor.companyId);
  if (!refreshToken) {
    return {
      ok: false,
      status: 409,
      code: "google_not_connected",
      message:
        "Connect a Google account in Settings before publishing to Google Forms.",
    };
  }

  const created = await createGoogleForm({
    refreshToken,
    title: form.title,
    description: form.summary,
    questions: form.questions,
  });

  if (!created) {
    return {
      ok: false,
      status: 502,
      code: "google_failed",
      message:
        "Google would not create the form. Check the connected account in Settings and try again.",
    };
  }

  await db.$transaction([
    db.hiringForm.update({
      where: { id: form.id },
      data: {
        destination: "GoogleForm",
        status: "Live",
        publishedAt: new Date(),
        googleFormId: created.formId,
        googleResponderUrl: created.responderUrl,
        googleEditUrl: created.editUrl,
        googleIdentityIds: created.identityIds,
      },
    }),
    ...Object.entries(created.questionIds).map(([questionId, googleItemId]) =>
      db.hiringQuestion.update({
        where: { id: questionId },
        data: { googleItemId },
      })
    ),
  ]);

  return {
    ok: true,
    responderUrl: created.responderUrl,
    editUrl: created.editUrl,
    downgradedDocuments: created.downgradedDocuments,
  };
}

export type SyncResult =
  | { ok: true; imported: number; total: number }
  | WriteFailure;

/**
 * Pull Google's responses into the applicant pipeline.
 *
 * Idempotent by `googleResponseId`: re-running the sync updates the rows it
 * already made instead of duplicating every candidate, which matters because
 * this is a button a user will press repeatedly. An applicant's `stage` and
 * notes are never touched by a re-sync — moving someone to Interview and then
 * losing it to a refresh would be worse than not syncing at all.
 */
export async function syncGoogleResponses(
  actor: SessionActor,
  formId: string
): Promise<SyncResult> {
  const form = await db.hiringForm.findFirst({
    where: scopedWhere(actor, { id: formId }),
    select: {
      id: true,
      googleFormId: true,
      googleIdentityIds: true,
      questions: { select: { id: true, googleItemId: true, type: true } },
    },
  });

  if (!form?.googleFormId) {
    return {
      ok: false,
      status: 409,
      code: "not_google_form",
      message: "This form was not published to Google Forms.",
    };
  }

  const refreshToken = await refreshTokenFor(actor.companyId);
  if (!refreshToken) {
    return {
      ok: false,
      status: 409,
      code: "google_not_connected",
      message: "Reconnect the company's Google account in Settings.",
    };
  }

  const responses = await listGoogleResponses({
    refreshToken,
    formId: form.googleFormId,
  });

  const [nameId, emailId, phoneId] = form.googleIdentityIds;
  const byGoogleId = new Map(
    form.questions
      .filter((question) => question.googleItemId)
      .map((question) => [question.googleItemId!, question])
  );

  const existing = await db.jobApplication.findMany({
    where: { companyId: actor.companyId, formId: form.id },
    select: { id: true, googleResponseId: true },
  });
  const known = new Set(
    existing.map((application) => application.googleResponseId).filter(Boolean)
  );

  let imported = 0;

  for (const response of responses) {
    if (known.has(response.responseId)) continue;

    const first = (id: string | undefined) =>
      id ? (response.answers[id]?.[0] ?? null) : null;

    await db.jobApplication.create({
      data: {
        companyId: actor.companyId,
        formId: form.id,
        // A Google Form can be answered anonymously; the identity questions
        // are required on our side, but an owner can delete them in Google's
        // editor, so neither field is assumed present.
        fullName: first(nameId) ?? "Unnamed applicant",
        email: first(emailId) ?? "",
        phone: first(phoneId),
        source: "GoogleForm",
        googleResponseId: response.responseId,
        submittedAt: response.submittedAt,
        answers: {
          create: Object.entries(response.answers)
            .filter(([googleId]) => byGoogleId.has(googleId))
            .map(([googleId, values]) => {
              const question = byGoogleId.get(googleId)!;
              return {
                companyId: actor.companyId,
                questionId: question.id,
                value: question.type === "MultiChoice" ? null : (values[0] ?? null),
                values: question.type === "MultiChoice" ? values : [],
              };
            }),
        },
      },
    });

    imported += 1;
  }

  await db.hiringForm.update({
    where: { id: form.id },
    data: { googleSyncedAt: new Date() },
  });

  return { ok: true, imported, total: responses.length };
}

/** Only the identity questions are WorkPulse's; re-exported for the UI copy. */
export { IDENTITY_QUESTIONS };
