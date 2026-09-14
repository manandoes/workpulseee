import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { navigationFor } from "@/lib/permissions";
import { loadOpenBreak } from "@/lib/attendance-data";
import { BrandMark } from "@/components/marketing/brand-mark";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { Avatar } from "@/components/dashboard/avatar";
import { BreakOverlay } from "@/components/attendance/break-overlay";
import { Toaster } from "@/components/ui/sonner";

/**
 * Authenticated app shell (Architecture.md section 6 — one shell that adapts to
 * the role, rather than separate apps per role).
 *
 * Middleware already blocks unauthenticated requests. This check is deliberate
 * defence in depth: the layout renders tenant data, so it verifies the session
 * itself rather than trusting the edge (Rules.md section 3).
 */
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  if (!session?.user?.companyId) {
    redirect("/login");
  }

  // Grants (Phase 11) only ever apply to an Employee actor — see
  // `getActor()` in lib/auth.ts, which this mirrors.
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

  const actor = {
    id: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    accountType: session.user.accountType,
    grants,
  };

  const navigation = navigationFor(actor);
  const roleLabel =
    actor.accountType === "employee" ? "Employee" : session.user.role;

  /**
   * Kept out of the session/JWT deliberately — a photo (even resized) would
   * bloat every request's cookie, so it's a lightweight extra read here
   * instead, alongside the other tenant-scoped queries this layout already
   * makes.
   */
  const avatarUrl =
    actor.accountType === "company"
      ? ((
          await db.companyAccount.findFirst({
            where: { id: actor.id, companyId: actor.companyId },
            select: { avatarUrl: true },
          })
        )?.avatarUrl ?? null)
      : ((
          await db.employee.findFirst({
            where: { id: actor.id, companyId: actor.companyId },
            select: { avatarUrl: true },
          })
        )?.avatarUrl ?? null);

  // Plan.md Phase 15: the blocking break overlay follows the employee across
  // every page, not only My Work, so it is loaded here rather than per-page.
  // Only ever set for an Employee actor — a company account never clocks in.
  const openBreak =
    actor.accountType === "employee" ? await loadOpenBreak(actor) : null;

  return (
    <div className="dashboard-theme flex min-h-full flex-1">
      {/* Design.md section 2: dashboard theme is yellow/white/black, scoped by
          the `dashboard-theme` class above rather than the global tokens, so
          the marketing site keeps its own palette. Sidebar is a white surface
          like the rest of the shell — yellow is reserved for the active item
          and brand accents — so `border-r` is what separates it from `<main>`
          now that they're no longer different colors. Sticky + h-screen keeps
          it pinned to the viewport height instead of stretching (and
          scrolling away) with tall main content. */}
      <aside className="bg-sidebar border-border hidden w-60 shrink-0 flex-col justify-between border-r p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div className="flex flex-col gap-8">
          <Link href={navigation[0].href} aria-label="Talking Lens Media home">
            <BrandMark />
          </Link>
          <SidebarNav items={navigation} />
        </div>

        <div className="flex flex-col gap-3">
          <NotificationBell className="self-start" align="left" />
          <Link
            href="/profile"
            className="hover:bg-brand-yellow-light flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Avatar name={session.user.name ?? "?"} avatarUrl={avatarUrl} />
            <span className="min-w-0">
              <p className="text-foreground truncate font-medium">
                {session.user.name}
              </p>
              <p className="text-text-secondary text-meta truncate">
                {roleLabel} · {session.user.companyName}
              </p>
            </span>
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header carrying the nav on small screens. */}
        <header className="border-border bg-surface flex items-center justify-between gap-4 border-b px-6 py-3 md:hidden">
          <BrandMark />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <SignOutButton />
          </div>
        </header>

        <nav
          aria-label="Main"
          className="border-border bg-surface flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-text-secondary hover:text-brand-brown rounded-lg px-3 py-1.5 whitespace-nowrap"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8">
          {children}
        </main>
      </div>

      <Toaster />
      <BreakOverlay
        openBreak={
          openBreak ? { startedAt: openBreak.startedAt.toISOString() } : null
        }
      />
    </div>
  );
}
