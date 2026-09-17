import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { db } from "@/lib/db";
import { hashInviteToken, isInviteExpired } from "@/lib/invites";

export const metadata: Metadata = {
  title: "Accept your invite — WorkPulse",
  description: "Set your password and join your company's workspace.",
};

type Invite = {
  kind: "employee" | "account";
  firstName: string;
  companyName: string;
  /** What their login provider identifies them by. */
  identifier: string;
};

/**
 * Resolve an invite token to whichever kind of invite it is.
 *
 * Both flows share one link shape, so the token is looked up by hash in each
 * table in turn. The tables stay strictly separate (Architecture.md section 8):
 * this only decides which form to render, and the two forms post to two
 * different endpoints that each touch a single table.
 */
async function findInvite(token: string): Promise<Invite | null> {
  const inviteTokenHash = hashInviteToken(token);

  const employee = await db.employee.findUnique({
    where: { inviteTokenHash },
    select: {
      fullName: true,
      companyEmail: true,
      status: true,
      deletedAt: true,
      inviteTokenExpiresAt: true,
      company: { select: { name: true, deletedAt: true } },
    },
  });

  if (employee) {
    const usable =
      !employee.deletedAt &&
      !employee.company.deletedAt &&
      employee.status === "Invited" &&
      !isInviteExpired(employee.inviteTokenExpiresAt);

    if (!usable) return null;

    return {
      kind: "employee",
      firstName: employee.fullName.split(" ")[0],
      companyName: employee.company.name,
      identifier: employee.companyEmail,
    };
  }

  const account = await db.companyAccount.findUnique({
    where: { inviteTokenHash },
    select: {
      fullName: true,
      workEmail: true,
      role: true,
      deletedAt: true,
      inviteTokenExpiresAt: true,
      company: { select: { name: true, deletedAt: true } },
    },
  });

  if (account) {
    const usable =
      !account.deletedAt &&
      !account.company.deletedAt &&
      !isInviteExpired(account.inviteTokenExpiresAt);

    if (!usable) return null;

    return {
      kind: "account",
      firstName: account.fullName.split(" ")[0],
      companyName: account.company.name,
      identifier: account.workEmail,
    };
  }

  return null;
}

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await findInvite(token);

  if (!invite) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 py-2">
          <h1 className="text-h1 text-brand-brown font-semibold">
            This invite link is not valid
          </h1>
          <p className="text-text-secondary">
            It may have expired, already been used, or been withdrawn. Ask your
            admin or HR team to send you a new one.
          </p>
          <Link
            href="/login"
            className="text-brand-brown font-medium underline underline-offset-4"
          >
            Go to sign-in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-brand-brown font-semibold">
            Welcome, {invite.firstName}
          </h1>
          <p className="text-text-secondary">
            {invite.companyName} has added you to WorkPulse
        . Choose a password to
            finish setting up your account.
          </p>
        </div>

        <AcceptInviteForm
          kind={invite.kind}
          token={token}
          identifier={invite.identifier}
        />
      </CardContent>
    </Card>
  );
}
