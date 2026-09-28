import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { equalizeTiming, verifyPassword } from "@/lib/passwords";
import { hasActiveSubscription, loadSubscription } from "@/lib/billing";
import { landingPathFor, type SessionActor } from "@/lib/permissions";
import { splitOverrides } from "@/lib/permission-grants";
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
      if (!token?.sub) return;

      // A CompanyAccount is never a task assignee, so there is never a
      // running task timer to stop for one — only an Employee needs this
      // step (Plan: attendance for all company accounts).
      if (token.accountType === "employee") {
        try {
          await stopRunningEntries(token.companyId as string, token.sub);
        } catch (cause) {
          console.error("[auth] failed to stop task timers on sign-out", {
            employeeId: token.sub,
            cause,
          });
        }
      }

      // Plan.md Phase 15 (widened by Plan: attendance for all company
      // accounts): signing out ends the working day, so an open break cannot
      // be left dangling either, for either actor type — same "the one hook
      // that always fires" reasoning as the task-timer close above.
      try {
        await closeOpenBreakOnSignOut(token.companyId as string, {
          kind: token.accountType === "employee" ? "employee" : "account",
          id: token.sub,
        });
      } catch (cause) {
        console.error("[auth] failed to close open break on sign-out", {
          subjectId: token.sub,
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
 *
 * Deliberately does NOT check the company's subscription — see `getActor`
 * below, which wraps this for every other call site. This raw form exists
 * only for `/api/billing/*` (Plan: Razorpay billing): the Owner must be able
 * to pay while their company is unsubscribed, so those routes cannot use the
 * gated `getActor` or they could never reach checkout in the first place.
 */
export async function getRawActor(): Promise<SessionActor | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.companyId || !user.id) return null;

  /**
   * Who this person is *now*, not when they signed in (Plan: access levels).
   * The JWT is minted at sign-in and lives for weeks, so everything that
   * decides access is read fresh here instead: the level, the Owner's
   * overrides, and whether the person still exists at all. A level change or
   * a switched-off power applies on their next request, and a suspended or
   * removed person is signed-out-equivalent immediately rather than when the
   * token expires. One indexed read per request either way, the same cost the
   * old company-exists check already paid.
   */
  const current =
    user.accountType === "employee"
      ? await db.employee
          .findFirst({
            where: {
              id: user.id,
              companyId: user.companyId,
              deletedAt: null,
              status: { not: "Suspended" },
              company: { deletedAt: null },
            },
            select: { permissionGrants: { select: overrideSelect } },
          })
          .then(
            (row) =>
              row && {
                role: "Employee" as const,
                overrides: row.permissionGrants,
              }
          )
      : await db.companyAccount
          .findFirst({
            where: {
              id: user.id,
              companyId: user.companyId,
              deletedAt: null,
              company: { deletedAt: null },
            },
            select: {
              role: true,
              permissionOverrides: { select: overrideSelect },
            },
          })
          .then(
            (row) =>
              row && { role: row.role, overrides: row.permissionOverrides }
          );
  if (!current) return null;

  return {
    id: user.id,
    companyId: user.companyId,
    role: current.role,
    accountType: user.accountType,
    ...splitOverrides(current.overrides),
  };
}

const overrideSelect = { permission: true, effect: true } as const;

/**
 * For the sign-in and registration pages: send someone who is genuinely
 * signed in to their home instead.
 *
 * Checked here, against the database, rather than in `proxy.ts` on the JWT
 * alone. A suspended or removed person still holds a valid-looking token;
 * bouncing them off `/login` at the edge while every page bounced them back
 * to it (because `getActor()` now refuses them) would trap them in a
 * redirect loop. Here they simply see the sign-in form.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const actor = await getRawActor();
  if (actor) redirect(landingPathFor(actor));
}

/**
 * The signed-in caller, or null — additionally gated on the company holding
 * an active subscription (Plan: Razorpay billing, requirement 2: "no
 * user/owner can login without having the subscription").
 *
 * Every existing API route already calls this and treats `null` as
 * "unauthorized" (Rules.md section 3 — the server check is the real
 * boundary, `app/(dashboard)/layout.tsx`'s redirect is the UX for it). Gating
 * here rather than in each of those ~30 routes means every one of them is
 * protected with no per-route change, and the one place that must bypass the
 * gate (billing itself, so an Owner can actually pay) uses `getRawActor`
 * instead.
 */
export async function getActor(): Promise<SessionActor | null> {
  const actor = await getRawActor();
  if (!actor) return null;

  const subscription = await loadSubscription(actor.companyId);
  if (!hasActiveSubscription(subscription)) return null;

  return actor;
}
