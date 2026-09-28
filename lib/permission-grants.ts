import type {
  CompanyRole,
  GrantedPermission,
  PermissionEffect,
} from "@/lib/generated/prisma/enums";

/**
 * The access-level catalog (Plan: access levels) — pure data, free of
 * Prisma/Next imports like every other `lib/<feature>.ts`, so the Owner's
 * Authority page (a client component) and `lib/permissions.ts` read one
 * source. What it *means* is decided in exactly one place: `has` in
 * `lib/permissions.ts`.
 *
 * Access = the person's level default, then the Owner's per-person override
 * (`PermissionGrant`), and never an Owner-only power — those (billing,
 * branding, email delivery, the Authority page itself) are not in this
 * catalog at all, so nothing here can hand them out.
 */

/** Every level a person can hold: the company-login levels, plus Employee. */
export type Level = CompanyRole | "Employee";

/** Lowest to highest, for display. */
export const LEVELS: readonly Level[] = [
  "Employee",
  "Manager",
  "HRTeam",
  "HRHead",
  "Admin",
  "Owner",
];

export const LEVEL_LABELS: Record<Level, string> = {
  Employee: "Employee",
  Manager: "Manager",
  HRTeam: "HR Team",
  HRHead: "HR Head",
  Admin: "Admin",
  Owner: "Owner",
};

/**
 * The levels the Owner may move a company login between. Never "Owner": that
 * identity is established once, by registration, and handing it over is not
 * a switch.
 */
export const ASSIGNABLE_LEVELS = [
  "Admin",
  "Manager",
  "HRHead",
  "HRTeam",
] as const satisfies readonly CompanyRole[];

export type PowerGroup = "Private data" | "People" | "Work";

export type Power = {
  value: GrantedPermission;
  label: string;
  description: string;
  group: PowerGroup;
  /**
   * Whether an Employee login can hold this power. The others either record
   * their author as a company login (a payslip's maker, a bulk email's
   * sender, a goal's setter) or — the client vault — were judged too
   * sensitive to hand to an employee at all (see `canManageClientVault`).
   */
  forEmployees: boolean;
};

export const POWER_GROUPS: readonly PowerGroup[] = [
  "Private data",
  "People",
  "Work",
];

export const POWERS: readonly Power[] = [
  {
    value: "ViewPersonalDetails",
    group: "Private data",
    label: "Personal details & ID",
    description:
      "Anyone's phone, personal email, address, date of birth and emergency contact.",
    forEmployees: true,
  },
  {
    value: "ViewAttendance",
    group: "Private data",
    label: "Attendance & working hours",
    description: "Anyone's clock-ins, breaks and total working hours.",
    forEmployees: true,
  },
  {
    value: "ManagePayroll",
    group: "Private data",
    label: "Salary & payroll",
    description:
      "See salaries, set the salary structure, and generate and publish payslips.",
    forEmployees: false,
  },
  {
    value: "ManageEmployees",
    group: "People",
    label: "Employee records",
    description:
      "Add and invite employees, edit their profiles, and suspend or remove them.",
    forEmployees: true,
  },
  {
    value: "DecideRequests",
    group: "People",
    label: "Approve requests",
    description:
      "Be chosen as an approver and decide leave, reimbursement and other requests.",
    forEmployees: true,
  },
  {
    value: "ManageRecruitment",
    group: "People",
    label: "Hiring",
    description:
      "Build hiring forms and work the applicant pipeline — applications carry CVs and salary expectations.",
    forEmployees: true,
  },
  {
    value: "SendBulkEmail",
    group: "People",
    label: "Org-wide email",
    description: "Email everyone in the company, or chosen groups of people.",
    forEmployees: false,
  },
  {
    value: "ManageHrPolicies",
    group: "People",
    label: "HR policies",
    description: "Set the daily break allowance for everyone.",
    forEmployees: true,
  },
  {
    value: "ViewPerformance",
    group: "Work",
    label: "View performance",
    description:
      "Everyone's performance scores, goals and feedback — not only their own team's.",
    forEmployees: true,
  },
  {
    value: "ManagePerformance",
    group: "Work",
    label: "Set goals & give feedback",
    description:
      "For anyone in the company. Managers can always do this for their own direct reports.",
    forEmployees: false,
  },
  {
    value: "ManageProjects",
    group: "Work",
    label: "Projects & clients",
    description:
      "See every project and client; company logins can also add them and tune workload capacity.",
    forEmployees: true,
  },
  {
    value: "ManageClientVault",
    group: "Work",
    label: "Client vault",
    description:
      "Store client passwords, see all of them, and approve other people's access.",
    forEmployees: false,
  },
  {
    value: "ViewFinancials",
    group: "Work",
    label: "Company financials",
    description: "Company-wide revenue, cost and margin across every client.",
    forEmployees: false,
  },
];

const ALL_POWERS = POWERS.map((power) => power.value);

const HR_TEAM_POWERS: readonly GrantedPermission[] = [
  "ViewPersonalDetails",
  "ViewAttendance",
  "ManageEmployees",
  "DecideRequests",
  "ManageRecruitment",
  "SendBulkEmail",
  "ViewPerformance",
  "ManagePerformance",
];

/**
 * What each level may do before the Owner adjusts anyone (the matrix the user
 * confirmed for Plan: access levels). HR Team is HR Head minus salary/payroll
 * and HR policies. Managers get work data company-wide (performance they can
 * view for everyone, goals and feedback only for their own team) and none of
 * the private data. The Owner row is informational — `has` never consults it.
 */
export const LEVEL_DEFAULTS: Record<Level, readonly GrantedPermission[]> = {
  Owner: ALL_POWERS,
  Admin: ALL_POWERS,
  HRHead: [...HR_TEAM_POWERS, "ManagePayroll", "ManageHrPolicies"],
  HRTeam: HR_TEAM_POWERS,
  Manager: [
    "DecideRequests",
    "ViewPerformance",
    "ManageProjects",
    "ManageClientVault",
  ],
  Employee: [],
};

/** Whether a login of this kind can hold `permission` at all. */
export function canHoldPower(
  kind: "company" | "employee",
  permission: GrantedPermission
): boolean {
  if (kind === "company") return true;
  return POWERS.some(
    (power) => power.value === permission && power.forEmployees
  );
}

/** Stored override rows, split the way `SessionActor` carries them. */
export function splitOverrides(
  rows: readonly { permission: GrantedPermission; effect: PermissionEffect }[]
): { grants: GrantedPermission[]; revokes: GrantedPermission[] } {
  return {
    grants: rows
      .filter((row) => row.effect === "Grant")
      .map((row) => row.permission),
    revokes: rows
      .filter((row) => row.effect === "Revoke")
      .map((row) => row.permission),
  };
}
