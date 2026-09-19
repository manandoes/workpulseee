import { db } from "@/lib/db";
import type { EmailTemplateKind } from "@/lib/generated/prisma/enums";
import { loadFilesForEmail } from "@/lib/files-data";
import {
  accountInviteEmailBody,
  inviteEmailBody,
  renderTemplate,
  type EmailAttachment,
} from "@/lib/mailer";

export type { EmailTemplateKind };

/**
 * Company overrides for the built-in transactional emails
 * (Plan: editable invite template).
 *
 * The built-in copy in `lib/mailer.ts` stays the default. A company that never
 * opens this setting has no row, and `buildInviteEmail` below falls through to
 * exactly the email it sent before — so this feature adds a capability without
 * changing any existing behaviour.
 */

export type LoadedEmailTemplate = {
  kind: EmailTemplateKind;
  subject: string;
  body: string;
  attachmentIds: string[];
};

export async function loadEmailTemplate(
  companyId: string,
  kind: EmailTemplateKind
): Promise<LoadedEmailTemplate | null> {
  return db.emailTemplate.findUnique({
    where: { companyId_kind: { companyId, kind } },
    select: { kind: true, subject: true, body: true, attachmentIds: true },
  });
}

export async function loadEmailTemplates(
  companyId: string
): Promise<LoadedEmailTemplate[]> {
  return db.emailTemplate.findMany({
    where: { companyId },
    select: { kind: true, subject: true, body: true, attachmentIds: true },
  });
}

export async function saveEmailTemplate(
  companyId: string,
  input: LoadedEmailTemplate
) {
  return db.emailTemplate.upsert({
    where: { companyId_kind: { companyId, kind: input.kind } },
    create: { companyId, ...input },
    update: {
      subject: input.subject,
      body: input.body,
      attachmentIds: input.attachmentIds,
    },
    select: { kind: true, subject: true, body: true, attachmentIds: true },
  });
}

/** Delete the override, returning the company to the built-in copy. */
export async function resetEmailTemplate(
  companyId: string,
  kind: EmailTemplateKind
) {
  await db.emailTemplate.deleteMany({ where: { companyId, kind } });
}

export type BuiltEmail = {
  subject: string;
  text: string;
  attachments: EmailAttachment[];
};

/**
 * The invite email to actually send: the company's template if it has one,
 * otherwise the built-in copy.
 *
 * Both invite routes call this instead of `inviteEmailBody`/
 * `accountInviteEmailBody` directly, so a company's customisation and its
 * attachments reach every invite path without either route knowing whether an
 * override exists.
 */
export async function buildInviteEmail(
  companyId: string,
  kind: EmailTemplateKind,
  values: {
    employeeName: string;
    companyName: string;
    inviteUrl: string;
    role?: string;
  }
): Promise<BuiltEmail> {
  const template = await loadEmailTemplate(companyId, kind);

  if (!template) {
    const built =
      kind === "AccountInvite"
        ? accountInviteEmailBody({
            name: values.employeeName,
            companyName: values.companyName,
            role: values.role ?? "team",
            inviteUrl: values.inviteUrl,
          })
        : inviteEmailBody({
            employeeName: values.employeeName,
            companyName: values.companyName,
            inviteUrl: values.inviteUrl,
          });

    return { ...built, attachments: [] };
  }

  return {
    subject: renderTemplate(template.subject, values),
    text: renderTemplate(template.body, values),
    attachments: await loadFilesForEmail(companyId, template.attachmentIds),
  };
}
