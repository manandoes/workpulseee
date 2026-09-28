import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

/**
 * Route protection (Architecture.md section 3.1).
 *
 * Built from `authConfig` alone — no Prisma — so it can run on the edge. The
 * JWT is verified here; the database is never consulted.
 */
const { auth } = NextAuth(authConfig);

/** Everything under the app shell requires a session. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/employees",
  "/projects",
  "/tasks",
  "/performance",
  "/requests",
  "/my-space",
  "/settings",
  "/notifications",
  "/squad",
  "/chat",
  "/calendar",
  "/announcements",
  "/payroll",
  "/communications",
  "/salary-slips",
  "/hiring",
  "/billing",
  "/vault",
];

/** Reachable by both account types, like `/my-space` — excluded from the
 * "company area" split below. */
const SHARED_PREFIXES = [
  "/my-space",
  "/notifications",
  "/squad",
  "/chat",
  "/calendar",
  "/announcements",
  // Plan: Razorpay billing — every actor of an unsubscribed company is
  // redirected here (`app/(dashboard)/layout.tsx`), employee and company
  // account alike, so this cannot be company-area-only routing.
  "/billing",
  // An employee opens their own slip here from Settings; the page itself
  // re-checks `canViewSalarySlip`, which is what actually keeps them to their
  // own (Rules.md section 3 — this split is routing, not authorization).
  "/salary-slips",
  // An Employee holding a `ManageRecruitment` grant works hiring here, so this
  // cannot be company-accounts-only routing. The page itself re-checks
  // `canManageRecruitment`, which is what actually keeps everyone else out.
  "/hiring",
  // Plan: client vault — employees request and view credentials here; the
  // manager-only tabs re-check `canManageClientVault` themselves.
  "/vault",
  // Every Employee has the personal Appearance card here, and an employee
  // holding `ManageHrPolicies` its break-allowance card; each card re-checks
  // its own power.
  "/settings",
  // An employee holding `ViewPerformance` (Plan: access levels) reads the
  // Performance queue; the pages re-check `canViewAllPerformance` /
  // `canViewPerformance` themselves.
  "/performance",
];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !session) {
    const signInUrl = new URL("/login", request.nextUrl.origin);
    // Send them back where they were headed once they have signed in.
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (session) {
    // Sending a signed-in user away from /login and /register is done by
    // those pages themselves (`redirectIfSignedIn` in lib/auth.ts), against
    // the database: this edge check can only see the JWT, which a suspended
    // or removed person still holds, and bouncing them here while every page
    // bounces them back would loop.

    /**
     * Employees have no company-wide views, and company accounts have no
     * personal space. Keep each on their own side of the app rather than
     * rendering a page they cannot use.
     */
    const isEmployee = session.user?.accountType === "employee";
    const wantsCompanyArea = PROTECTED_PREFIXES.filter(
      (prefix) => !SHARED_PREFIXES.includes(prefix)
    ).some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (isEmployee && wantsCompanyArea) {
      return NextResponse.redirect(
        new URL("/my-space", request.nextUrl.origin)
      );
    }
    if (!isEmployee && pathname.startsWith("/my-space")) {
      return NextResponse.redirect(
        new URL("/dashboard", request.nextUrl.origin)
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next internals, the auth API, static assets, and the SEO/metadata
  // routes a crawler hits directly — none of these need a JWT verified.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image|icon.png|apple-icon.png).*)",
  ],
};
