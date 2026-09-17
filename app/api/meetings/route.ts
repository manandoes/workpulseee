import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
  writeFailure,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadMeetingsForRange, proposeMeeting } from "@/lib/calendar-data";
import {
  calendarRangeSchema,
  proposeMeetingSchema,
} from "@/lib/validations/calendar";

/**
 * GET /api/meetings — the signed-in person's own meetings (organizer or
 * invitee) in a date range. POST /api/meetings — book one (Plan.md Phase 17).
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = calendarRangeSchema.safeParse(params);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const meetings = await loadMeetingsForRange(
      actor,
      new Date(parsed.data.from),
      new Date(parsed.data.to)
    );
    return NextResponse.json({ meetings });
  } catch (cause) {
    return serverError(
      { route: "GET /api/meetings", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}

export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = proposeMeetingSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await proposeMeeting(actor, {
      title: parsed.data.title,
      description: parsed.data.description || null,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      location: parsed.data.location || null,
      participants: parsed.data.participants,
    });

    if (!resolved.ok) return writeFailure(resolved);

    return NextResponse.json({ meeting: resolved.meeting }, { status: 201 });
  } catch (cause) {
    return serverError(
      { route: "POST /api/meetings", companyId: actor.companyId, actorId: actor.id },
      cause
    );
  }
}
