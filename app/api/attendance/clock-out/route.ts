import { NextResponse } from "next/server";
import { forbidden, serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { clockOut } from "@/lib/attendance-data";

/**
 * POST /api/attendance/clock-out — end the caller's open attendance session.
 *
 * Mirrors `/api/attendance/clock-in`: employee logins only.
 */
export async function POST() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (actor.accountType !== "employee") {
    return forbidden("Only an employee can clock themselves out.");
  }

  try {
    const resolved = await clockOut(actor);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ record: resolved.record });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/attendance/clock-out",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
