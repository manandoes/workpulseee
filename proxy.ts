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
];

/** Reachable by both account types, like `/my-space` — excluded from the
 * "company area" split below. */
const SHARED_PREFIXES = ["/my-space", "/notifications", "/squad", "/chat"];

/** Signed-in users have no reason to see these again. */
const AUTH_PAGES = ["/login", "/register"];

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
    const isAuthPage = AUTH_PAGES.some(
      (page) => pathname === page || pathname.startsWith(`${page}/`)
    );

    if (isAuthPage) {
      const home =
        session.user?.accountType === "employee" ? "/my-space" : "/dashboard";
      return NextResponse.redirect(new URL(home, request.nextUrl.origin));
    }

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
  // Skip Next internals, the auth API, and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
