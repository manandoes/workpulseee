import { NextResponse } from "next/server";
import { apiError, forbidden, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { cancelMeeting, findMeetingCancelSubject } from "@/lib/calendar-data";
import { canCancelMeeting } from "@/lib/permissions";

/** DELETE /api/meetings/[id] — cancel a meeting. Organizer-only. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/meetings/[id]">
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { id } = await context.params;

  try {
    const meeting = await findMeetingCancelSubject(actor, id);
    if (!meeting) return apiError("Meeting not found.", 404, "not_found");

    if (!canCancelMeeting(actor, meeting)) {
      return forbidden("Only the organizer can cancel this meeting.");
    }

    await cancelMeeting(actor, meeting);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "DELETE /api/meetings/[id]",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
