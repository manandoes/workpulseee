import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleUserEmail,
  refreshGoogleAccessToken,
} from "@/lib/google-oauth";
import type { HiringQuestionType } from "@/lib/generated/prisma/enums";

/**
 * Google Forms as a publishing destination (Plan: hiring).
 *
 * Plain `fetch` against Google's REST endpoints, like `lib/google-calendar.ts`
 * and for the same reason (Rules.md section 1 — the `googleapis` package is
 * ~50MB of surface for a handful of HTTPS calls). The OAuth handshake is
 * shared with calendar via `lib/google-oauth.ts`; only the scope, the redirect
 * URI and the API calls below are hiring's own.
 *
 * Access tokens are never stored: every call exchanges the company's stored
 * refresh token for a fresh one first.
 */

const FORMS_ENDPOINT = "https://forms.googleapis.com/v1/forms";

/**
 * `forms.body` to create and edit the form, `forms.responses.readonly` to pull
 * applications back, `openid email` so the connect flow can report which
 * account was linked. Least privilege: nothing here can touch Drive at large
 * or any form WorkPulse did not create.
 */
export const FORMS_SCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
].join(" ");

/** Whether every env var the Forms integration needs is set. */
export function googleFormsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_FORMS_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  );
}

function redirectUri(): string | null {
  return process.env.GOOGLE_FORMS_REDIRECT_URI ?? null;
}

export function buildFormsAuthUrl(state: string): string | null {
  const uri = redirectUri();
  if (!uri) return null;
  return buildGoogleAuthUrl({ scope: FORMS_SCOPE, redirectUri: uri, state });
}

export async function exchangeFormsCode(code: string) {
  const uri = redirectUri();
  if (!uri) return null;
  return exchangeGoogleCode(code, uri);
}

export { fetchGoogleUserEmail as fetchFormsUserEmail };

/**
 * The three questions WorkPulse always puts at the top of a Google Form.
 *
 * `JobApplication` stores name, email and phone as columns, so the Google Form
 * has to collect them too — otherwise a synced application would arrive with
 * nobody attached to it. Google's own "collect email" setting is not reachable
 * through the Forms API, so they are ordinary questions.
 */
export const IDENTITY_QUESTIONS = [
  { title: "Full name", required: true },
  { title: "Email address", required: true },
  { title: "Phone number", required: false },
] as const;

/**
 * A `Document` question cannot be created through the Forms API — Google does
 * not expose file-upload items for creation. Rather than silently dropping the
 * question, it is published as a link question, and the publish route tells
 * the user this happened. Honest degradation beats a form that quietly lost
 * the CV field.
 */
export const DOCUMENT_SUBSTITUTE_HINT =
  "Paste a link to your file (Google Drive, Dropbox, a public URL).";

export type FormsQuestion = {
  id: string;
  type: HiringQuestionType;
  label: string;
  helpText: string | null;
  required: boolean;
  options: string[];
};

export type CreatedGoogleForm = {
  formId: string;
  responderUrl: string;
  editUrl: string;
  /** Google question ids for the three identity questions, in order. */
  identityIds: string[];
  /** WorkPulse question id → Google question id. */
  questionIds: Record<string, string>;
  /** Labels that had to be published as a link question instead of an upload. */
  downgradedDocuments: string[];
};

async function accessTokenFrom(refreshToken: string): Promise<string | null> {
  return refreshGoogleAccessToken(refreshToken);
}

/**
 * Create the Google Form and fill it in.
 *
 * Two calls, because Google requires them: `forms.create` accepts only the
 * title, and every item is added afterwards through `batchUpdate`. The
 * `batchUpdate` reply carries the question ids, which is the only way to map a
 * later response back onto the question it answered.
 *
 * Returns `null` on any failure rather than throwing — the publish route turns
 * that into a message and leaves the form unpublished, which is recoverable;
 * a thrown error mid-way would leave a Google Form nobody in WorkPulse knows
 * about.
 */
export async function createGoogleForm(input: {
  refreshToken: string;
  title: string;
  description: string | null;
  questions: FormsQuestion[];
}): Promise<CreatedGoogleForm | null> {
  const accessToken = await accessTokenFrom(input.refreshToken);
  if (!accessToken) return null;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    const created = await fetch(FORMS_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        info: { title: input.title, documentTitle: input.title },
      }),
    });

    if (!created.ok) {
      console.error("[google-forms] Create rejected", {
        status: created.status,
      });
      return null;
    }

    const form = (await created.json()) as {
      formId?: string;
      responderUri?: string;
    };
    if (!form.formId) return null;

    const downgradedDocuments: string[] = [];
    const requests: unknown[] = [];
    let index = 0;

    if (input.description) {
      requests.push({
        updateFormInfo: {
          info: { description: input.description },
          updateMask: "description",
        },
      });
    }

    for (const identity of IDENTITY_QUESTIONS) {
      requests.push({
        createItem: {
          item: {
            title: identity.title,
            questionItem: {
              question: {
                required: identity.required,
                textQuestion: { paragraph: false },
              },
            },
          },
          location: { index: index++ },
        },
      });
    }

    for (const question of input.questions) {
      if (question.type === "Document") downgradedDocuments.push(question.label);

      requests.push({
        createItem: {
          item: {
            title: question.label,
            description:
              question.type === "Document"
                ? DOCUMENT_SUBSTITUTE_HINT
                : (question.helpText ?? undefined),
            questionItem: {
              question: {
                required: question.required,
                ...questionBody(question),
              },
            },
          },
          location: { index: index++ },
        },
      });
    }

    const updated = await fetch(`${FORMS_ENDPOINT}/${form.formId}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requests, includeFormInResponse: false }),
    });

    if (!updated.ok) {
      console.error("[google-forms] batchUpdate rejected", {
        status: updated.status,
      });
      return null;
    }

    const body = (await updated.json()) as {
      replies?: { createItem?: { itemId?: string; questionId?: string[] } }[];
    };

    // The replies come back positionally, one per request, and only the
    // `createItem` ones carry ids — so a leading `updateFormInfo` has to be
    // filtered out before the positions line up with our questions.
    const createdIds = (body.replies ?? [])
      .filter((reply) => reply.createItem)
      .map((reply) => reply.createItem?.questionId?.[0] ?? "");

    const identityIds = createdIds.slice(0, IDENTITY_QUESTIONS.length);
    const questionIds: Record<string, string> = {};
    input.questions.forEach((question, position) => {
      const id = createdIds[IDENTITY_QUESTIONS.length + position];
      if (id) questionIds[question.id] = id;
    });

    return {
      formId: form.formId,
      responderUrl:
        form.responderUri ?? `https://docs.google.com/forms/d/${form.formId}/viewform`,
      editUrl: `https://docs.google.com/forms/d/${form.formId}/edit`,
      identityIds,
      questionIds,
      downgradedDocuments,
    };
  } catch (cause) {
    console.error("[google-forms] Could not reach the Forms API", { cause });
    return null;
  }
}

/** Map one WorkPulse question type onto Google's item vocabulary. */
function questionBody(question: FormsQuestion): Record<string, unknown> {
  switch (question.type) {
    case "LongText":
      return { textQuestion: { paragraph: true } };

    case "SingleChoice":
      return {
        choiceQuestion: {
          type: "RADIO",
          options: question.options.map((value) => ({ value })),
        },
      };

    case "MultiChoice":
      return {
        choiceQuestion: {
          type: "CHECKBOX",
          options: question.options.map((value) => ({ value })),
        },
      };

    case "Dropdown":
      return {
        choiceQuestion: {
          type: "DROP_DOWN",
          options: question.options.map((value) => ({ value })),
        },
      };

    case "Date":
      return { dateQuestion: { includeYear: true } };

    // ShortText, Email, Phone, Number and the downgraded Document all become a
    // single-line text question. Google has no narrower type for them, and its
    // own validation rules are not worth a second round trip here — the
    // synced answer is validated on the way in either way.
    default:
      return { textQuestion: { paragraph: false } };
  }
}

export type GoogleResponse = {
  responseId: string;
  submittedAt: Date;
  /** Google question id → the answer's text values. */
  answers: Record<string, string[]>;
};

/** Every response on a form. Returns an empty list on any failure. */
export async function listGoogleResponses(input: {
  refreshToken: string;
  formId: string;
}): Promise<GoogleResponse[]> {
  const accessToken = await accessTokenFrom(input.refreshToken);
  if (!accessToken) return [];

  try {
    const response = await fetch(
      `${FORMS_ENDPOINT}/${input.formId}/responses`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      console.error("[google-forms] Response list rejected", {
        status: response.status,
      });
      return [];
    }

    const body = (await response.json()) as {
      responses?: {
        responseId?: string;
        lastSubmittedTime?: string;
        answers?: Record<
          string,
          { textAnswers?: { answers?: { value?: string }[] } }
        >;
      }[];
    };

    return (body.responses ?? [])
      .filter((entry) => entry.responseId)
      .map((entry) => ({
        responseId: entry.responseId!,
        submittedAt: entry.lastSubmittedTime
          ? new Date(entry.lastSubmittedTime)
          : new Date(),
        answers: Object.fromEntries(
          Object.entries(entry.answers ?? {}).map(([questionId, answer]) => [
            questionId,
            (answer.textAnswers?.answers ?? [])
              .map((value) => value.value ?? "")
              .filter((value) => value.length > 0),
          ])
        ),
      }));
  } catch (cause) {
    console.error("[google-forms] Could not reach the Forms API", { cause });
    return [];
  }
}
