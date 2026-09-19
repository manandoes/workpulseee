import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  forbidden,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { scopedWhere } from "@/lib/tenant";
import { db } from "@/lib/db";
import { directoryFilter } from "@/lib/employees";
import { resolveEmployeeWrite } from "@/lib/employee-data";
import {
  countBillableEmployees,
  employeeCapFor,
  loadSubscription,
} from "@/lib/billing";
import { EXTRA_SEAT_PRICE_PAISE } from "@/lib/plans";
import { loadEmailConfig } from "@/lib/company-email-config";
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiryFrom,
} from "@/lib/invites";
import { sendEmail } from "@/lib/mailer";
import { buildInviteEmail } from "@/lib/email-template-data";
import { canManageEmployees, canViewAllEmployees } from "@/lib/permissions";
import {
  createEmployeeSchema,
  directoryFiltersSchema,
} from "@/lib/validations/employees";

/**
 * GET /api/employees — the employee directory for the caller's company.
 *
 * Supports the same search and filters as the directory page, so the two can
 * never disagree about what a role is allowed to see.
 */
export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canViewAllEmployees(actor)) return forbidden();

  const filters = directoryFiltersSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  try {
    const employees = await db.employee.findMany({
      // Tenant scoping (Rules.md section 2) — applied last, so a filter can
      // never widen the query beyond the caller's own company.
      where: scopedWhere(actor, directoryFilter(filters)),
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        companyEmail: true,
        jobRole: true,
        employmentType: true,
        status: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        manager: { select: { id: true, fullName: true } },
        managerAccount: { select: { id: true, fullName: true } },
      },
    });

    return NextResponse.json({ employees });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/employees",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/employees — add an employee and send their invite.
 *
 * Architecture.md section 8: only a CompanyAccount holding Owner, Admin or HR
 * may create an Employee row, and the employee sets their own password from a
 * one-time invite link.
 */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  // Role check is server-side and independent of what the UI showed
  // (Rules.md section 3).
  if (!canManageEmployees(actor)) {
    return forbidden("Only owners, admins and HR can add employees.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = createEmployeeSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const company = await db.company.findFirst({
      where: { id: actor.companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) return apiError("Company not found.", 404, "not_found");

    // Plan: Razorpay billing, requirement 3 — the plan's employee cap plus
    // any extra seats purchased. `actor` only exists here because
    // `getActor()` already proved the subscription is active, so a
    // subscription row is guaranteed to exist.
    const [subscription, employeeCount] = await Promise.all([
      loadSubscription(actor.companyId),
      countBillableEmployees(actor.companyId),
    ]);
    const cap = employeeCapFor(subscription);
    if (employeeCount >= cap) {
      const extraSeatPrice = (EXTRA_SEAT_PRICE_PAISE / 100).toLocaleString(
        "en-IN"
      );
      return NextResponse.json(
        {
          error: `You've reached your plan's employee limit (${cap}). Upgrade your plan or buy extra seats for ₹${extraSeatPrice} each in Settings → Billing.`,
          code: "seat_limit_reached",
        },
        { status: 409 }
      );
    }

    const resolved = await resolveEmployeeWrite(actor, parsed.data, {
      includePersonal: false,
    });

    if (!resolved.ok) {
      return NextResponse.json(
        {
          error: resolved.message,
          code: resolved.code,
          ...(resolved.field
            ? { fieldErrors: { [resolved.field]: resolved.message } }
            : {}),
        },
        { status: resolved.status }
      );
    }

    const token = generateInviteToken();

    const employee = await db.employee.create({
      data: {
        ...resolved.data,
        companyId: actor.companyId,
        status: "Invited",
        // Only the hash is stored; the plaintext token lives in the link alone.
        inviteTokenHash: hashInviteToken(token),
        inviteTokenExpiresAt: inviteExpiryFrom(),
        invitedById: actor.accountType === "company" ? actor.id : null,
      },
      select: { id: true, fullName: true, companyEmail: true, status: true },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
    const inviteUrl = buildInviteUrl(baseUrl, token);

    // Falls back to `inviteEmailBody` when the company has not customised the
    // invite (Plan: editable invite template), so this path is unchanged for
    // every company that never opens that setting.
    const { subject, text, attachments } = await buildInviteEmail(
      actor.companyId,
      "EmployeeInvite",
      {
        employeeName: employee.fullName,
        companyName: company.name,
        inviteUrl,
      }
    );
    const emailConfig = await loadEmailConfig(actor.companyId);
    const delivery = await sendEmail(
      {
        to: employee.companyEmail,
        subject,
        text,
        attachments,
      },
      emailConfig
    );

    return NextResponse.json(
      {
        employee,
        emailDelivered: delivery.delivered,
        /**
         * Returned so an admin can share the link themselves when email is not
         * configured, or when delivery failed. Safe to expose here: the caller
         * has already been authorised to invite this person.
         */
        inviteUrl,
      },
      { status: 201 }
    );
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/employees",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
