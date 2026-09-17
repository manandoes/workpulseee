import { z } from "zod";

/**
 * Validation for announcements and polls (Rules.md section 4).
 *
 * A poll is optional and, when present, needs 2-8 non-empty options — the
 * same bounds a native ballot needs to mean anything (one option is not a
 * choice, and beyond eight the UI stops reading as a quick poll).
 */
export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3, "Give the announcement a title").max(160),
  body: z.string().trim().min(1, "Write the announcement").max(4000),
  poll: z
    .object({
      options: z
        .array(z.string().trim().min(1, "Options cannot be blank").max(120))
        .min(2, "A poll needs at least two options")
        .max(8, "A poll can have at most eight options"),
    })
    .optional(),
});

export const voteSchema = z.object({
  pollOptionId: z.string().trim().min(1, "Pick an option"),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
