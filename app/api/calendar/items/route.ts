import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverError, unauthorized, validationError } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadCalendarItems } from "@/lib/calendar-data";
import { calendarItemsQuerySchema } from "@/lib/validations/calendar";

/**
 * GET /api/calendar/items — everything the month/week grid shows for the
 * signed-in person in a date range: meetings, tasks by due date, their own
 * Google events and time off. Scoping lives in `loadCalendarItems`.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = calendarItemsQuerySchema.safeParse(params);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const items = await loadCalendarItems(
      actor,
      new Date(parsed.data.from),
      new Date(parsed.data.to)
    );
    return NextResponse.json(items);
  } catch (cause) {
    return serverError(
      { route: "GET /api/calendar/items", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}
