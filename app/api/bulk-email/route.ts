import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canSendBulkEmail } from "@/lib/permissions";
import { resolveRecipients, sendBulkEmail } from "@/lib/bulk-email-data";
import { sendBulkEmailSchema } from "@/lib/validations/bulk-email";

/**
 * POST /api/bulk-email — email an audience of the company (Plan: bulk email).
 *
 * `?preview=1` resolves the audience and returns only how many people it
 * reaches, without sending — what the composer shows before the user commits
 * to a send they cannot take back.
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canSendBulkEmail(actor)) {
    return forbidden("Only owners, admins and HR can email the company.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = sendBulkEmailSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const preview = new URL(request.url).searchParams.get("preview") === "1";

  try {
    if (preview) {
      const recipients = await resolveRecipients(actor, parsed.data.audience, {
        employeeIds: parsed.data.employeeIds,
        accountIds: parsed.data.accountIds,
      });
      return NextResponse.json({ recipientCount: recipients.length });
    }

    const result = await sendBulkEmail(actor, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/bulk-email",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
