import { NextResponse } from "next/server";
import { serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { confirmPresence } from "@/lib/attendance-data";

/**
 * POST /api/attendance/presence — "I'm here", the answer to a logout reminder.
 *
 * Confirms the caller is still at their desk, which keeps their session open
 * and buys another two hours before the next reminder. Answered from three
 * places — the bell, the `/notifications` page, and a push notification's
 * button via `public/sw.js` — all of which post here.
 *
 * No device check, unlike `/api/attendance/clock-in`: this neither starts a
 * session nor extends what is counted as worked time on its own, and refusing
 * it on a phone would strand exactly the person a push notification just
 * reached.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const resolved = await confirmPresence(actor);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ record: resolved.record });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/attendance/presence",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
