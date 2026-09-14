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
import { startBreak } from "@/lib/attendance-data";
import { attendanceAllowedOnDevice } from "@/lib/device";

/**
 * POST /api/attendance/break/start — start a break inside the caller's open
 * attendance session (Plan.md Phase 15).
 *
 * Employee logins only, same split `/api/attendance/clock-in` draws. The
 * Phase 14 device check applies here too — starting a break is an attendance
 * action, and the same laptop-sized-screen reasoning holds.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (actor.accountType !== "employee") {
    return forbidden("Only an employee can take a break.");
  }

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
