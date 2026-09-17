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
import { loadEmailConfig } from "@/lib/company-email-config";
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiryFrom,
} from "@/lib/invites";
import { accountInviteEmailBody, sendEmail } from "@/lib/mailer";
import { canManageCompanyAccounts } from "@/lib/permissions";
import { inviteCompanyAccountSchema } from "@/lib/validations/employees";

/**
 * The Owner / Admin / Manager / HR logins themselves.
 *
 * Architecture.md section 4: the first Owner comes from registration, and the
 * rest are "invited by an Owner/Admin". Employees are a different table with a
 * different login and are never created here.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();
  if (!canManageCompanyAccounts(actor)) return forbidden();

  try {
    const rows = await db.companyAccount.findMany({
      where: scopedWhere(actor),
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fullName: true,
        workEmail: true,
        role: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    /**
     * The hash never leaves the server — it is read only to work out whether
     * the invite has been accepted yet, and dropped before responding
     * (Rules.md section 4 — never log or return sensitive data).
     */
    const accounts = rows.map(({ passwordHash, ...account }) => ({
      ...account,
      pending: passwordHash === null,
    }));

    return NextResponse.json({ accounts });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/company-accounts",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** POST /api/company-accounts — invite an Admin, Manager or HR login. */
export async function POST(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  if (!canManageCompanyAccounts(actor)) {
    return forbidden("Only owners and admins can invite company accounts.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = inviteCompanyAccountSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const { fullName, workEmail, role } = parsed.data;

  try {
    const company = await db.company.findFirst({
      where: { id: actor.companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) return apiError("Company not found.", 404, "not_found");

    const duplicate = await db.companyAccount.findFirst({
      where: scopedWhere(actor, { workEmail }),
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        {
          error: "An account with that email already exists in this company.",
          code: "duplicate_account",
          fieldErrors: {
            workEmail:
              "An account with that email already exists in this company.",
          },
        },
        { status: 409 }
      );
    }

    const token = generateInviteToken();

    const account = await db.companyAccount.create({
      data: {
        companyId: actor.companyId,
        fullName,
        workEmail,
        role,
        // No password until they accept — same scheme as the employee invite.
        passwordHash: null,
        inviteTokenHash: hashInviteToken(token),
        inviteTokenExpiresAt: inviteExpiryFrom(),
        invitedById: actor.accountType === "company" ? actor.id : null,
      },
      select: { id: true, fullName: true, workEmail: true, role: true },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;
    const inviteUrl = buildInviteUrl(baseUrl, token);

    const { subject, text } = accountInviteEmailBody({
      name: account.fullName,
      companyName: company.name,
      role: account.role,
      inviteUrl,
    });
    const emailConfig = await loadEmailConfig(actor.companyId);
    const delivery = await sendEmail(
      { to: account.workEmail, subject, text },
      emailConfig
    );

    return NextResponse.json(
      { account, emailDelivered: delivery.delivered, inviteUrl },
      { status: 201 }
    );
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/company-accounts",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
