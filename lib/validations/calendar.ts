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

export const availabilityQuerySchema = calendarRangeSchema.extend({
  kind: z.enum(["employee", "account"]),
  id: z.string().trim().min(1),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
