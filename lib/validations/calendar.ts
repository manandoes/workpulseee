import { z } from "zod";

/**
 * Validation for calendar meetings (Rules.md section 4). Mirrors
 * `lib/validations/requests.ts`'s cross-field `.superRefine` idiom.
 */

const participantSchema = z.object({
  kind: z.enum(["employee", "account"]),
  id: z.string().trim().min(1),
});

export const proposeMeetingSchema = z
  .object({
    title: z.string().trim().min(1, "Give the meeting a title").max(160),
    description: z.string().trim().max(4000).optional().or(z.literal("")),
    startAt: z.string().trim().datetime({ message: "Enter a valid start time" }),
    endAt: z.string().trim().datetime({ message: "Enter a valid end time" }),
    location: z.string().trim().max(200).optional().or(z.literal("")),
    participants: z
      .array(participantSchema)
      .min(1, "Invite at least one person"),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.endAt).getTime() <= new Date(value.startAt).getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "End time must be after the start time.",
      });
    }

    const seen = new Set<string>();
    for (const [index, participant] of value.participants.entries()) {
      const key = `${participant.kind}:${participant.id}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["participants", index],
          message: "The same person is invited twice.",
        });
      }
      seen.add(key);
    }
  });

export type ProposeMeetingInput = z.infer<typeof proposeMeetingSchema>;

/** Range query shared by `/api/meetings` and `/api/calendar/availability`. */
export const calendarRangeSchema = z.object({
  from: z.string().trim().datetime(),
  to: z.string().trim().datetime(),
});

export type CalendarRangeInput = z.infer<typeof calendarRangeSchema>;

/** Longest window the calendar grid asks for: a 6-week month view, with slack. */
export const CALENDAR_ITEMS_MAX_DAYS = 45;

/**
 * Range for `/api/calendar/items`. Bounded, unlike `calendarRangeSchema`,
 * because this one fans out to tasks, requests and Google in one call.
 */
export const calendarItemsQuerySchema = calendarRangeSchema.superRefine(
  (value, ctx) => {
    const span = new Date(value.to).getTime() - new Date(value.from).getTime();
    if (span <= 0) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "`to` must be after `from`." });
    } else if (span > CALENDAR_ITEMS_MAX_DAYS * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Ask for at most ${CALENDAR_ITEMS_MAX_DAYS} days at a time.`,
      });
    }
  }
);

export const availabilityQuerySchema = calendarRangeSchema.extend({
  kind: z.enum(["employee", "account"]),
  id: z.string().trim().min(1),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
