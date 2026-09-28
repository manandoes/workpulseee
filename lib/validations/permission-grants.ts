import { z } from "zod";
import { GrantedPermission } from "@/lib/generated/prisma/enums";
import { ASSIGNABLE_LEVELS } from "@/lib/permission-grants";

/** Validation for the Owner's Authority page (Plan: access levels). */

const powerSubjectSchema = z.object({
  kind: z.enum(["employee", "account"]),
  id: z.string().trim().min(1).max(64),
});

/** Switch one power on or off for one person. */
export const setPowerSchema = z.object({
  subject: powerSubjectSchema,
  permission: z.enum(GrantedPermission),
  enabled: z.boolean(),
});

/** Drop every override — the person follows their level again. */
export const resetPowersSchema = z.object({ subject: powerSubjectSchema });

/** The person whose change history to read, from the query string. */
export const powerHistoryQuerySchema = powerSubjectSchema;

/** Move a company login to another level. Never to Owner. */
export const changeLevelSchema = z.object({ role: z.enum(ASSIGNABLE_LEVELS) });

export type SetPowerInput = z.infer<typeof setPowerSchema>;
