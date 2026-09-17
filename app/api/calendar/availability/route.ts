import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverError, unauthorized, validationError } from "@/lib/api";
import { getActor } from "@/lib/auth";
import {
  loadColleagueBusy,
  loadMeetingsForRange,
  loadMyPreview,
} from "@/lib/calendar-data";
import { mergeIntervals } from "@/lib/calendar";
import { availabilityQuerySchema } from "@/lib/validations/calendar";

/**
 * GET /api/calendar/availability — a person's schedule in a date range.
 *
 * Yourself: titled Google events plus your own meetings. Anyone else in the
 * tenant: busy intervals only, no titles — the privacy rule Plan.md calls
 * out, enforced in `lib/calendar-data.ts`, not here.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = availabilityQuerySchema.safeParse(params);
  if (!parsed.success) return validationError(parsed.error);

  const { kind, id, from, to } = parsed.data;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const isSelf = kind === actor.accountType && id === actor.id;

  try {
    if (isSelf) {
      const [preview, meetings] = await Promise.all([
        loadMyPreview(actor, fromDate, toDate),
        loadMeetingsForRange(actor, fromDate, toDate),
      ]);
      return NextResponse.json({
        self: true,
        events: preview.map((event) => ({
          title: event.title,
          start: event.start,
          end: event.end,
          location: event.location,
        })),
        meetings,
      });
    }

    const [busy, meetings] = await Promise.all([
      loadColleagueBusy(actor, { kind, id }, fromDate, toDate),
      loadMeetingsForRange(actor, fromDate, toDate),
    ]);

    // Only the shared meetings (the actor is on them, so they already carry
    // titles) plus the colleague's busy-only Google blocks — never a title
    // for something the actor isn't invited to.
    const sharedMeetingIntervals = meetings
      .filter((meeting) =>
        meeting.participants.some((p) => p.kind === kind && p.id === id)
      )
      .map((meeting) => ({ start: meeting.startAt, end: meeting.endAt }));

    return NextResponse.json({
      self: false,
      busy: mergeIntervals([...busy, ...sharedMeetingIntervals]),
    });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/calendar/availability",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
