import { z } from "zod";

/** Validation for the Owner's permission-grant table (Phase 11). */
export const setGrantSchema = z.object({
  employeeId: z.string().trim().min(1),
  permission: z.enum([
    "ViewPersonalDetails",
    "ManageEmployees",
    "ManageProjects",
    "DecideRequests",
  ]),
  granted: z.boolean(),
});

export type SetGrantInput = z.infer<typeof setGrantSchema>;
