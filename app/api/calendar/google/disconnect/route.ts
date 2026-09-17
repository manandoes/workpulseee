import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { disconnectConnection } from "@/lib/calendar-data";

/** POST /api/calendar/google/disconnect — forget the caller's own connection. */
export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    await disconnectConnection(actor);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/calendar/google/disconnect",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
