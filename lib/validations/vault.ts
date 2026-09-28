import { z } from "zod";
import { ACCESS_ACTIONS, CREDENTIAL_KINDS } from "@/lib/vault";

/**
 * Validation for the client vault (Plan: client vault) — Rules.md section 4,
 * every body is checked before anything touches the database.
 */

const credentialField = z.object({
  key: z.string().trim().min(1, "Name this field").max(60),
  // Not trimmed: a password may genuinely start or end with a space.
  value: z.string().min(1, "Enter a value").max(2000),
});

/**
 * The credential form, shared by the client (React Hook Form) and both write
 * routes. A text credential needs at least one field; a file credential's
 * file travels beside this as multipart, so the route checks that part.
 */
export const credentialFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give it a title").max(120),
    kind: z.enum(CREDENTIAL_KINDS),
    fields: z.array(credentialField).max(20, "At most 20 fields"),
    remark: z.string().trim().max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "text" && value.fields.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["fields"],
        message: "Add at least one field",
      });
    }
  });

export const createCredentialSchema = z.intersection(
  credentialFormSchema,
  z.object({ clientId: z.string().min(1) })
);

export const requestAccessSchema = z.object({
  credentialIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one credential")
    .max(50),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const decideAccessSchema = z.object({
  action: z.enum(ACCESS_ACTIONS),
});

export type CredentialFormInput = z.infer<typeof credentialFormSchema>;
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type RequestAccessInput = z.infer<typeof requestAccessSchema>;
export type DecideAccessInput = z.infer<typeof decideAccessSchema>;
