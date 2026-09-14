import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { clockIn } from "@/lib/attendance-data";
import { attendanceAllowedOnDevice } from "@/lib/device";

/**
 * POST /api/attendance/clock-in — start today's attendance session.
 *
 * Employee logins only: attendance is something an employee does to
 * themselves, not something a company account does on their behalf, the same
 * split `/api/tasks/[id]/status` draws between "my own board" and "the
 * projects I manage".
 *
 * Plan.md Phase 14: clocking in is refused from a phone or tablet
 * (`lib/device.ts`) — clocking out stays allowed everywhere so an open
 * session can never get stranded.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (actor.accountType !== "employee") {
    return forbidden("Only an employee can clock themselves in.");
  }

  const { device } = userAgent(request);
  if (!attendanceAllowedOnDevice(device.type)) {
    return apiError(
      "Clock in from a laptop or larger screen.",
      403,
      "small_screen"
    );
  }

  try {
    const resolved = await clockIn(actor);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ record: resolved.record });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/attendance/clock-in",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
