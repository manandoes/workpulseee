import { z } from "zod";

/**
 * Validation for the invite email templates (Rules.md section 4).
 */

const kindSchema = z.enum(["EmployeeInvite", "AccountInvite"]);

export const emailTemplateSchema = z.object({
  kind: kindSchema,
  subject: z
    .string()
    .trim()
    .min(1, "Write a subject")
    .max(200, "Subject is too long"),
  body: z
    .string()
    .trim()
    .min(1, "Write the email body")
    .max(20_000, "Body is too long")
    // The invite is useless without the link, and a template that omits it
    // would send an unusable email to every new joiner — caught here rather
    // than discovered by the recipient.
    .refine((value) => value.includes("{{inviteUrl}}"), {
      message: "Include {{inviteUrl}} so the recipient can set their password",
    }),
  attachmentIds: z.array(z.string().trim().min(1)).default([]),
});

export const resetEmailTemplateSchema = z.object({ kind: kindSchema });

export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;
