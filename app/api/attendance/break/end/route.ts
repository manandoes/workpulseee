import { NextResponse } from "next/server";
import { serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { endBreak } from "@/lib/attendance-data";

/**
 * POST /api/attendance/break/end — end the caller's open break, resuming a
 * fresh timer on each task it had paused (Plan.md Phase 15).
 *
 * Every actor, same widening `/api/attendance/clock-out` carries (Plan:
 * attendance for all company accounts). No device check, same reasoning as
 * `/api/attendance/clock-out`: ending a break has to stay allowed on any
 * screen, or the blocking break overlay could strand someone mid-break on a
 * phone with no way out.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const resolved = await endBreak(actor);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ record: resolved.record });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/attendance/break/end",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
