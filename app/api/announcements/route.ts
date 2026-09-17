import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { canManageAnnouncements } from "@/lib/permissions";
import {
  createAnnouncement,
  loadAnnouncementsPage,
  loadRecentAnnouncements,
} from "@/lib/announcement-data";
import { createAnnouncementSchema } from "@/lib/validations/announcements";
import { paginationSchema } from "@/lib/pagination";

/**
 * GET /api/announcements — the company's announcement feed.
 *
 * Readable by anyone signed in, employees included: an announcement is a
 * broadcast, not a delivery-role document. `?limit=` returns just the most
 * recent few for the top-bar dropdown, the same way `NotificationBell` reuses
 * `/api/notifications` instead of a second endpoint.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const params = request.nextUrl.searchParams;
  const limit = Number(params.get("limit"));

  try {
    if (Number.isInteger(limit) && limit > 0) {
      const announcements = await loadRecentAnnouncements(actor, limit);
      return NextResponse.json({ announcements });
    }

    const { page } = paginationSchema.parse(
      Object.fromEntries(params)
    );
    const result = await loadAnnouncementsPage(actor, page);
    return NextResponse.json(result);
  } catch (cause) {
    return serverError(
      { route: "GET /api/announcements", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}

/** POST /api/announcements — post a new announcement, optionally with a poll. */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageAnnouncements(actor)) return forbidden();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = createAnnouncementSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await createAnnouncement(actor, parsed.data);
    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ id: resolved.id }, { status: 201 });
  } catch (cause) {
    return serverError(
      { route: "POST /api/announcements", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}
