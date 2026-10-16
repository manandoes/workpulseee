import { z } from "zod";

/**
 * Feedback / enhancement submission (Plan: software feedback button).
 *
 * The message is plain text entered by the user in the floating dialog;
 * file ids are posted as a JSON array alongside it. The server uploads
 * each file to the company's tenant bucket and then sends one email per
 * configured recipient.
 */
export const FEEDBACK_MESSAGE_MAX = 5_000;

export const feedbackSubmitSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Write a message before sending")
    .max(FEEDBACK_MESSAGE_MAX, `Keep this under ${FEEDBACK_MESSAGE_MAX} characters`),
  fileIds: z.array(z.string().cuid()).default([]),
});

export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;
