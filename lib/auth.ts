import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { equalizeTiming, verifyPassword } from "@/lib/passwords";
import type { SessionActor } from "@/lib/permissions";
import { stopRunningEntries } from "@/lib/task-timer-data";
import { closeOpenBreakOnSignOut } from "@/lib/attendance-data";
import {
  companyLoginSchema,
  employeeLoginSchema,
} from "@/lib/validations/auth";

/**
 * Sign-in failures we want the form to explain precisely. Anything else falls
 * back to a deliberately vague "those details did not match", so the forms
 * cannot be used to discover which accounts exist.
 */
class AuthError extends CredentialsSignin {
  constructor(public readonly reason: string) {
    super(reason);
    this.code = reason;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    /**
     * COMPANY LOGIN — reads the CompanyAccount table and nothing else.
     *
     * Architecture.md section 8: this path must never consult `Employee`, so
     * an employee's credentials can never authenticate as a company account.
     */
    Credentials({
      id: "company-login",
      name: "Company Login",
      credentials: {
        workEmail: {},
        password: {},
        companySlug: {},
      },
      async authorize(raw) {
        const parsed = companyLoginSchema.safeParse(raw);
        if (!parsed.success) {
          await equalizeTiming();
          return null;
        }

        const { workEmail, password, companySlug } = parsed.data;

        const accounts = await db.companyAccount.findMany({
          where: {
            workEmail,
            deletedAt: null,
            company: {
              deletedAt: null,
              ...(companySlug ? { slug: companySlug } : {}),
            },
          },
          include: { company: true },
        });

        if (accounts.length === 0) {
          // Spend the same time as a real check so a missing account cannot be
          // told apart from a wrong password by response timing.
          await equalizeTiming();
          return null;
        }

        /**
         * Work email is unique per company, not globally (Architecture.md
         * section 4), so the same address can exist in several tenants. When it
         * does, ask which company rather than guessing.
         */
        if (accounts.length > 1) {
          throw new AuthError("company_required");
        }

        const account = accounts[0];

        // An invited Admin/Manager/HR account has no password until they accept
        // their invite, so there is nothing to verify - point them at the link
        // instead (same handling as an invited employee).
        if (!account.passwordHash) {
          throw new AuthError("invite_pending");
        }

        const passwordValid = await verifyPassword(
          password,
          account.passwordHash
        );
        if (!passwordValid) return null;

        return {
          id: account.id,
          name: account.fullName,
          email: account.workEmail,
          companyId: account.companyId,
          companySlug: account.company.slug,
          companyName: account.company.name,
          role: account.role,
          accountType: "company" as const,
        };
      },
    }),

    /**
     * EMPLOYEE LOGIN — reads the Employee table and nothing else.
     *
     * Architecture.md section 8: this path must never consult
     * `CompanyAccount`. An employee is always scoped to one company, so the
     * company slug is required rather than optional.
     */
    Credentials({
      id: "employee-login",
      name: "Employee Login",
      credentials: {
        companySlug: {},
        identifier: {},
        password: {},
      },
      async authorize(raw) {
        const parsed = employeeLoginSchema.safeParse(raw);
        if (!parsed.success) {
          await equalizeTiming();
          return null;
        }

        const { companySlug, identifier, password } = parsed.data;

        const company = await db.company.findFirst({
          where: { slug: companySlug, deletedAt: null },
        });
        if (!company) {
          await equalizeTiming();
          return null;
        }

        // Employees may sign in with either their employee code or their
        // company email, so accept whichever they typed.
        const employee = await db.employee.findFirst({
          where: {
            companyId: company.id,
            deletedAt: null,
            OR: [
              { employeeCode: identifier },
              { companyEmail: identifier.toLowerCase() },
            ],
          },
        });

        if (!employee) {
          await equalizeTiming();
          return null;
        }

        // Invited employees have no password yet, so there is nothing to
        // verify — point them at their invite link instead.
        if (!employee.passwordHash) {
          throw new AuthError("invite_pending");
        }

        const passwordValid = await verifyPassword(
          password,
          employee.passwordHash
        );
        if (!passwordValid) return null;

        // Checked only after the password is proven, so account status is never
        // revealed to someone who does not already hold the credentials.
        if (employee.status === "Suspended") {
          throw new AuthError("account_suspended");
        }

        return {
          id: employee.id,
          name: employee.fullName,
          email: employee.companyEmail,
          companyId: employee.companyId,
          companySlug: company.slug,
          companyName: company.name,
          role: "Employee" as const,
          accountType: "employee" as const,
        };
      },
    }),
  ],

  events: {
    /**
     * Signing out closes every task timer the employee still had running
     * (Phase 12 — task time tracking).
     *
     * Here rather than in the sign-out button, because a timer that keeps
     * ticking overnight is a data problem, not a UI one: the client can be
     * closed, blocked or simply crash mid-request, and anything that only ran
     * in the browser would leave the clock going. This is the one hook that
     * fires for every sign-out path the app has.
     *
     * It cannot cover a session that merely expires unattended — there is no
     * event for that — so the timer is deliberately an interval with a
     * recorded reason rather than a running total: an entry closed at
     * sign-out is marked `SignedOut` and is visible as such in the log.
     *
     * Failure is swallowed for the same reason `safeRecalcEmployeeWorkload`
     * swallows its own: nobody should be held signed in because a follow-up
     * write failed.
     */
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (!token?.sub || token.accountType !== "employee") return;

      try {
        await stopRunningEntries(token.companyId as string, token.sub);
      } catch (cause) {
        console.error("[auth] failed to stop task timers on sign-out", {
          employeeId: token.sub,
          cause,
        });
      }

      // Plan.md Phase 15: signing out ends the working day, so an open break
      // cannot be left dangling either — same "the one hook that always
      // fires" reasoning as the task-timer close above.
      try {
        await closeOpenBreakOnSignOut(token.companyId as string, token.sub);
      } catch (cause) {
        console.error("[auth] failed to close open break on sign-out", {
          employeeId: token.sub,
          cause,
        });
      }
    },
  },
});

/**
 * The signed-in caller, or null. Returns a plain `SessionActor` so callers
 * cannot accidentally depend on NextAuth internals.
 *
 * The session is a JWT, so it can outlive the company it points to (e.g. a
 * dev database reset/reseed, or the company being deleted). Treat that as
 * "not signed in" rather than letting every `companyId`-scoped query 500 with
 * `findUniqueOrThrow`.
 */
export async function getActor(): Promise<SessionActor | null> {
  const session = await auth();
  if (!session?.user?.companyId) return null;

  const company = await db.company.findFirst({
    where: { id: session.user.companyId, deletedAt: null },
    select: { id: true },
  });
  if (!company) return null;

  // Grants (Phase 11) only ever apply to an Employee actor — a CompanyAccount
  // already has its powers through `CompanyRole`. Read fresh on every call,
  // the same "no client can go stale" guarantee every other field here has.
  const grants =
    session.user.accountType === "employee"
      ? (
          await db.permissionGrant.findMany({
            where: {
              companyId: session.user.companyId,
              employeeId: session.user.id,
            },
            select: { permission: true },
          })
        ).map((grant) => grant.permission)
      : [];

  return {
    id: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    accountType: session.user.accountType,
    grants,
  };
}
