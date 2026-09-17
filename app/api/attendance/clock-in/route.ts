import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";
import { apiError, serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { clockIn } from "@/lib/attendance-data";
import { attendanceAllowedOnDevice } from "@/lib/device";

/**
 * POST /api/attendance/clock-in — start today's attendance session.
 *
 * Every actor clocks themselves in — an Employee, or a company account
 * (Owner/Admin/Manager/HR) reviewed on the same attendance/performance
 * parameters (Plan: attendance for all company accounts) — never something
 * done on someone else's behalf.
 *
 * Plan.md Phase 14: clocking in is refused from a phone or tablet
 * (`lib/device.ts`) — clocking out stays allowed everywhere so an open
 * session can never get stranded.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

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
