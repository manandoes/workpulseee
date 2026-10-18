import { z } from "zod";

/**
 * Contact form submission (public, no auth required).
 *
 * Fields: name, email, subject, message.
 */
export const CONTACT_MESSAGE_MAX = 1_000;

export const contactSubmitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(100, "Email must be 100 characters or less"),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or less"),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(CONTACT_MESSAGE_MAX, `Keep this under ${CONTACT_MESSAGE_MAX} characters`),
});

export type ContactSubmitInput = z.infer<typeof contactSubmitSchema>;