import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { loadEmailConfig } from "@/lib/company-email-config";
import { loadFilesForEmail } from "@/lib/files-data";
import { feedbackSubmitSchema } from "@/lib/validations/feedback";

const DEFAULT_RECIPIENT = "info@automovalabs.tech";
const SUBJECT = "WorkPulse Feedback";

/**
 * POST /api/feedback — submit a feedback/enhancement message with optional
 * file attachments to the company's configured recipients (or the global
 * default), delivered via the company's own email config when one exists.
 *
 * All actors may submit; file reading is scoped to the actor's company.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = feedbackSubmitSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const { message, fileIds } = parsed.data;
  const { companyId } = actor;

  // Read the feedback recipients for this company; fall back to the global
  // default when nothing is set.
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true, feedbackRecipients: true },
  });

  const recipients = parseRecipients(company.feedbackRecipients);
  const actorName = "WorkPulse user";

  // Load stored files into base64 for the email attachment shape, only
  // keeping the ones the actor's company owns.
  const attachments =
    fileIds.length > 0
      ? await loadFilesForEmail(companyId, fileIds)
      : [];

  const emailConfig = await loadEmailConfig(companyId);

  // One email per recipient rather than CC-ing them, because providers
  // treat the first `to` address differently in templates and tracking.
  let sentCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const text = [
      `From: ${actorName}`,
      `Company: ${company.name}`,
      "",
      message,
      ...(attachments.length
        ? [
            "",
            "--- Attachments ---",
            ...attachments.map((a) => `• ${a.name}`),
          ]
        : []),
    ].join("\n");

    const result = await sendEmail(
      { to: recipient, subject: SUBJECT, text, attachments },
      emailConfig
    );

    if (result.delivered) {
      sentCount++;
    } else {
      errors.push(`${recipient}: ${result.reason}`);
    }
  }

  if (sentCount === 0) {
    return serverError(
      {
        route: "POST /api/feedback",
        companyId,
        actorId: actor.id,
      },
      new Error(`All feedback sends failed: ${errors.join(", ")}`)
    );
  }

  return NextResponse.json({ sentTo: sentCount, total: recipients.length });
}

/**
 * Parse the comma-separated feedback recipients on the Company record.
 *
 * Empty / missing input yields the default so the action always has at
 * least one destination; blank entries and duplicates are skipped.
 */
function parseRecipients(raw: string | null): string[] {
  const seen = new Set<string>();
  const output: string[] = [DEFAULT_RECIPIENT];

  if (raw) {
    for (const rawAddress of raw.split(",")) {
      const address = rawAddress.trim();
      if (!address || seen.has(address)) continue;
      seen.add(address);
      output.push(address);
    }
  }

  return output;
}
