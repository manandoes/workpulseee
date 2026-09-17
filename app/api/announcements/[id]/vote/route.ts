import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { castVote } from "@/lib/announcement-data";
import { voteSchema } from "@/lib/validations/announcements";

/**
 * POST /api/announcements/[id]/vote — cast or move the caller's vote on the
 * poll attached to announcement `[id]`.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/announcements/[id]/vote">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = voteSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const poll = await db.poll.findFirst({
      where: { announcementId: id, companyId: actor.companyId },
      select: { id: true },
    });
    if (!poll) return apiError("This announcement has no poll.", 404, "not_found");

    const resolved = await castVote(actor, poll.id, parsed.data.pollOptionId);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/announcements/[id]/vote",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
