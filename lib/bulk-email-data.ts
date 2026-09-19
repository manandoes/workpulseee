import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import type { BulkEmailAudience } from "@/lib/generated/prisma/enums";
import {
  BULK_EMAIL_CONCURRENCY,
  dedupeRecipients,
  mapWithConcurrency,
} from "@/lib/bulk-email";
import { loadEmailConfig } from "@/lib/company-email-config";
import { loadFilesForEmail } from "@/lib/files-data";
import { sendEmail } from "@/lib/mailer";

/**
 * Recipient resolution and sending for bulk email (Plan: bulk email).
 */

export type BulkRecipient = { name: string; email: string };

/**
 * The addresses an audience resolves to, right now.
 *
 * Deliberately resolved at send time rather than stored: `Everyone` means
 * whoever works here on the day it is sent, and a snapshot taken when the
 * message was drafted would quietly exclude a new joiner. Only `Specific`
 * carries ids, and even those are re-read through the tenant filter so an id
 * from another company resolves to nothing rather than an address.
 */
export async function resolveRecipients(
  actor: SessionActor,
  audience: BulkEmailAudience,
  picked: { employeeIds: string[]; accountIds: string[] }
): Promise<BulkRecipient[]> {
  const wantsEmployees =
    audience === "Everyone" ||
    audience === "Employees" ||
    (audience === "Specific" && picked.employeeIds.length > 0);
  const wantsAccounts =
    audience === "Everyone" ||
    audience === "CompanyAccounts" ||
    (audience === "Specific" && picked.accountIds.length > 0);

  const [employees, accounts] = await Promise.all([
    wantsEmployees
      ? db.employee.findMany({
          where: {
            companyId: actor.companyId,
            deletedAt: null,
            ...(audience === "Specific"
              ? { id: { in: picked.employeeIds } }
              : {}),
          },
          select: { fullName: true, companyEmail: true },
        })
      : Promise.resolve([]),
    wantsAccounts
      ? db.companyAccount.findMany({
          where: {
            companyId: actor.companyId,
            deletedAt: null,
            ...(audience === "Specific"
              ? { id: { in: picked.accountIds } }
              : {}),
          },
          select: { fullName: true, workEmail: true },
        })
      : Promise.resolve([]),
  ]);

  return dedupeRecipients([
    ...accounts.map((account) => ({
      name: account.fullName,
      email: account.workEmail,
    })),
    ...employees.map((employee) => ({
      name: employee.fullName,
      email: employee.companyEmail,
    })),
  ]);
}

export type BulkSendResult = {
  id: string;
  recipientCount: number;
  deliveredCount: number;
};

/**
 * Sends the message and records what happened.
 *
 * The audit row is written after the send, with the real delivered count, so
 * it can never claim a delivery that did not occur. A send to nobody is still
 * recorded — "HR emailed the Bangalore team and it reached no one" is exactly
 * the kind of thing the log exists to answer.
 */
export async function sendBulkEmail(
  actor: SessionActor,
  input: {
    subject: string;
    body: string;
    audience: BulkEmailAudience;
    employeeIds: string[];
    accountIds: string[];
    attachmentIds: string[];
  }
): Promise<BulkSendResult> {
  const [recipients, config, attachments] = await Promise.all([
    resolveRecipients(actor, input.audience, {
      employeeIds: input.employeeIds,
      accountIds: input.accountIds,
    }),
    loadEmailConfig(actor.companyId),
    loadFilesForEmail(actor.companyId, input.attachmentIds),
  ]);

  const outcomes = await mapWithConcurrency(
    recipients,
    BULK_EMAIL_CONCURRENCY,
    (recipient) =>
      sendEmail(
        {
          to: recipient.email,
          subject: input.subject,
          text: input.body,
          attachments,
        },
        config
      )
  );

  const deliveredCount = outcomes.filter((result) => result.delivered).length;

  const record = await db.bulkEmail.create({
    data: {
      companyId: actor.companyId,
      sentById: actor.accountType === "company" ? actor.id : null,
      subject: input.subject,
      body: input.body,
      audience: input.audience,
      employeeIds: input.employeeIds,
      accountIds: input.accountIds,
      attachmentIds: input.attachmentIds,
      recipientCount: recipients.length,
      deliveredCount,
    },
    select: { id: true },
  });

  return {
    id: record.id,
    recipientCount: recipients.length,
    deliveredCount,
  };
}

/** Past sends, most recent first — the audit view. */
export async function loadBulkEmails(actor: SessionActor, limit = 20) {
  return db.bulkEmail.findMany({
    where: { companyId: actor.companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      subject: true,
      audience: true,
      recipientCount: true,
      deliveredCount: true,
      createdAt: true,
      sentBy: { select: { fullName: true } },
    },
  });
}
