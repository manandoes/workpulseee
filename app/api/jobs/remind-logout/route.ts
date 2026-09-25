import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { tokenHashMatches } from "@/lib/invites";
import { remindLogout } from "@/jobs/remindLogout";

/**
 * POST /api/jobs/remind-logout — the end-of-day logout sweep.
 *
 * Mirrors `app/api/jobs/notify-deadlines/route.ts` exactly: no session, meant
 * for an external scheduler, guarded by `CRON_SECRET` compared in constant
 * time with `tokenHashMatches`. `.github/workflows/scheduled-jobs.yml` is what
 * calls it.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return serverError(
      { route: "POST /api/jobs/remind-logout" },
      new Error("CRON_SECRET is not set")
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !tokenHashMatches(provided, secret)) {
    return unauthorized("Missing or invalid cron secret.");
  }

  try {
    const result = await remindLogout();
    return NextResponse.json({ swept: result });
  } catch (cause) {
    return serverError({ route: "POST /api/jobs/remind-logout" }, cause);
  }
}
