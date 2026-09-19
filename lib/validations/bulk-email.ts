import { z } from "zod";
import { BULK_EMAIL_BODY_MAX, BULK_EMAIL_SUBJECT_MAX } from "@/lib/bulk-email";

/**
 * Validation for bulk email (Rules.md section 4).
 */

export const sendBulkEmailSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, "Write a subject")
      .max(BULK_EMAIL_SUBJECT_MAX, "Subject is too long"),
    body: z
      .string()
      .trim()
      .min(1, "Write a message")
      .max(BULK_EMAIL_BODY_MAX, "Message is too long"),
    audience: z.enum(["Everyone", "Employees", "CompanyAccounts", "Specific"]),
    employeeIds: z.array(z.string().trim().min(1)).default([]),
    accountIds: z.array(z.string().trim().min(1)).default([]),
    attachmentIds: z.array(z.string().trim().min(1)).default([]),
  })
  .refine(
    (value) =>
      value.audience !== "Specific" ||
      value.employeeIds.length + value.accountIds.length > 0,
    {
      message: "Choose at least one person",
      path: ["employeeIds"],
    }
  );

export type SendBulkEmailInput = z.infer<typeof sendBulkEmailSchema>;
