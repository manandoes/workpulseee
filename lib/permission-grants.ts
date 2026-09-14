import type { GrantedPermission } from "@/lib/generated/prisma/enums";

/**
 * Pure permission-grant logic (Phase 11) — free of Prisma/Next imports, like
 * every other `lib/<feature>.ts`. Just the curated list the Owner can hand
 * out; the actual authorization logic these feed lives in
 * `lib/permissions.ts`'s `hasGrant`, not here.
 */

export const GRANTABLE_PERMISSIONS: readonly {
  value: GrantedPermission;
  label: string;
  description: string;
}[] = [
  {
    value: "ViewPersonalDetails",
    label: "View personal details",
    description:
      "See a colleague's personal details, working hours and growth on their Squad card.",
  },
  {
    value: "ManageEmployees",
    label: "Manage employees",
    description:
      "Edit a colleague's professional profile from their Squad card. Includes viewing personal details.",
  },
  {
    value: "ManageProjects",
    label: "Manage projects",
    description: "See the company's projects from My Space.",
  },
  {
    value: "DecideRequests",
    label: "Decide on requests",
    description: "Approve or reject any employee request from My Space.",
  },
] as const;
