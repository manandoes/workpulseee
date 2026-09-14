import { z } from "zod";
import { CHAT_MESSAGE_MAX_LENGTH, CHAT_MESSAGE_MIN_LENGTH } from "@/lib/chat";

/**
 * Validation for chat (Rules.md section 4 — every request body is validated
 * before anything touches the database). Mirrors `lib/validations/requests.ts`.
 */

export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(CHAT_MESSAGE_MIN_LENGTH, "Write a message")
    .max(CHAT_MESSAGE_MAX_LENGTH, "Message is too long"),
});

/**
 * Starting a conversation targets either an Employee or a CompanyAccount —
 * the same "exactly one of these" shape the schema itself uses
 * (`Employee.managerId`/`managerAccountId`), just decoded from a request body
 * instead of two nullable columns.
 */
export const startConversationSchema = z
  .object({
    employeeId: z.string().trim().min(1).optional(),
    accountId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.employeeId) !== Boolean(value.accountId), {
    message: "Choose exactly one person to message",
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
