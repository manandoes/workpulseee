import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";
import { apiError, serverError, unauthorized, writeFailure } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { startBreak } from "@/lib/attendance-data";
import { attendanceAllowedOnDevice } from "@/lib/device";

/**
 * POST /api/attendance/break/start — start a break inside the caller's open
 * attendance session (Plan.md Phase 15).
 *
 * Every actor, same widening `/api/attendance/clock-in` carries (Plan:
 * attendance for all company accounts). The Phase 14 device check applies
 * here too — starting a break is an attendance action, and the same
 * laptop-sized-screen reasoning holds.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { device } = userAgent(request);
  if (!attendanceAllowedOnDevice(device.type)) {
    return apiError(
      "Take a break from a laptop or larger screen.",
      403,
      "small_screen"
    );
  }

  try {
    const resolved = await startBreak(actor);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ record: resolved.record });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/attendance/break/start",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
