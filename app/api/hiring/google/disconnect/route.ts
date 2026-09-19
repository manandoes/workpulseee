import { NextResponse } from "next/server";
import { forbidden, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageRecruitment } from "@/lib/permissions";
import { deleteFormsConnection } from "@/lib/google-forms-data";

/**
 * POST /api/hiring/google/disconnect — forget the company's Google account.
 *
 * Forms already created on Google are deliberately left alone: they belong to
 * that Google account, candidates may already hold their links, and deleting
 * someone's documents because they unlinked an integration would be the wrong
 * reading of this button. What stops is the sync.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageRecruitment(actor)) {
    return forbidden("Only owners, admins and anyone granted hiring can do that.");
  }

  try {
    await deleteFormsConnection(actor.companyId);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/hiring/google/disconnect",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
