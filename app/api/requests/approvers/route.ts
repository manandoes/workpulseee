import { NextResponse } from "next/server";
import { forbidden, serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { scopedWhere } from "@/lib/tenant";
import { db } from "@/lib/db";
import { has } from "@/lib/permissions";
import { LEVEL_LABELS, splitOverrides } from "@/lib/permission-grants";

/**
 * GET /api/requests/approvers — list people a request can be submitted to
 * (Phase 21).
 *
 * Exactly the people who hold `DecideRequests` right now (Plan: access
 * levels): every company login unless the Owner switched it off for them,
 * plus the employees the Owner switched it on for. The employee submitting
 * the request is excluded.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (actor.accountType !== "employee") {
    return forbidden("Only employees can submit requests.");
  }

  try {
    const [allAccounts, employeesWithGrant] = await Promise.all([
      db.companyAccount.findMany({
        where: scopedWhere(actor, {}),
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          role: true,
          permissionOverrides: { select: { permission: true, effect: true } },
        },
      }),
      // The Employee level holds no powers by default, so an employee can
      // approve only through an Owner's grant — filtered in the query rather
      // than loading every employee to test each one. A suspended employee
      // could never sign in to decide, so they are not offered.
      db.employee.findMany({
        where: scopedWhere(actor, {
          status: { not: "Suspended" as const },
          permissionGrants: {
            some: {
              permission: "DecideRequests" as const,
              effect: "Grant" as const,
            },
          },
        }),
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, jobRole: true },
      }),
    ]);
    const accounts = allAccounts.filter((account) =>
      has(
        {
          accountType: "company",
          role: account.role,
          ...splitOverrides(account.permissionOverrides),
        },
        "DecideRequests"
      )
    );

    const approvers: {
      id: string;
      name: string;
      kind: "account" | "employee";
      roleOrJobRole: string;
    }[] = [];

    for (const account of accounts) {
      // Exclude the employee themselves if they somehow have a company account
      // (they shouldn't, but be safe)
      approvers.push({
        id: account.id,
        name: account.fullName,
        kind: "account",
        roleOrJobRole: LEVEL_LABELS[account.role],
      });
    }

    for (const employee of employeesWithGrant) {
      if (employee.id === actor.id) continue; // don't list yourself
      approvers.push({
        id: employee.id,
        name: employee.fullName,
        kind: "employee",
        roleOrJobRole: employee.jobRole ?? "Employee",
      });
    }

    return NextResponse.json({ approvers });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/requests/approvers",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}