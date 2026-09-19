import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasActiveSubscription, loadSubscription } from "@/lib/billing";
import {
  navigationFor,
  canManageAnnouncements,
  DASHBOARD_MODE_COOKIE,
  THEME_COOKIE,
  type DashboardMode,
  type ThemeMode,
} from "@/lib/permissions";
import { loadOpenBreak } from "@/lib/attendance-data";
import { BrandMark } from "@/components/marketing/brand-mark";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { AnnouncementBell } from "@/components/dashboard/announcement-bell";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { Avatar } from "@/components/dashboard/avatar";
import { ModeToggle } from "@/components/dashboard/mode-toggle";
import { BreakOverlay } from "@/components/attendance/break-overlay";
import { Toaster } from "@/components/ui/sonner";

/**
 * Titles the dashboard's tab as "Page — <Company name>" rather than
 * "Page" once a company is signed in, by defining a
 * `title.template` here — Next resolves the nearest ancestor layout's
 * template, so every dashboard page's plain `metadata.title` (e.g.
 * "Employees") is composed with it automatically, with no page needing to
 * become `async` or know the company name itself. `session.user.companyName`
 * is already on the JWT (`lib/auth.ts`), so this needs no database query.
 *
 * Returning `{}` when there's no session is deliberate: metadata can be
 * generated while a redirect is in flight and must not throw.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth();
  const companyName = session?.user?.companyName;

  if (!companyName) return {};

  return {
    title: { default: companyName, template: `%s — ${companyName}` },
  };
}

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

  // Plan: Razorpay billing (requirement 2) — every page in this shell, for
  // every actor type, requires the company to have paid access. Checked here
  // rather than per-page because this layout is the one chokepoint every
  // dashboard route renders through; `getActor()` (lib/auth.ts) applies the
  // same gate for every API route, so a direct API call is blocked too.
  const subscription = await loadSubscription(session.user.companyId);
  if (!hasActiveSubscription(subscription)) {
    redirect("/billing");
  }

  const cookieStore = await cookies();

  // Grants (Phase 11) only ever apply to an Employee actor — see
  // `getActor()` in lib/auth.ts, which this mirrors. None of these four
  // reads depend on each other, so they run together rather than paying
  // round-trip latency four times over on every navigation.
  const [grantRows, { brandColor }, avatarRow, openBreak] = await Promise.all([
    session.user.accountType === "employee"
      ? db.permissionGrant.findMany({
          where: {
            companyId: session.user.companyId,
            employeeId: session.user.id,
          },
          select: { permission: true },
        })
      : Promise.resolve([]),
    // Owner-only branding (Plan: brand color) — company-wide, so it is read
    // here once and applied as a CSS variable override rather than per-page.
    db.company.findUniqueOrThrow({
      where: { id: session.user.companyId },
      select: { brandColor: true },
    }),
    /**
     * Kept out of the session/JWT deliberately — a photo (even resized)
     * would bloat every request's cookie, so it's a lightweight extra read
     * here instead, alongside the other tenant-scoped queries this layout
     * already makes.
     */
    session.user.accountType === "company"
      ? db.companyAccount.findFirst({
          where: { id: session.user.id, companyId: session.user.companyId },
          select: { avatarUrl: true },
        })
      : db.employee.findFirst({
          where: { id: session.user.id, companyId: session.user.companyId },
          select: { avatarUrl: true },
        }),
    // Plan.md Phase 15 (widened by Plan: attendance for all company
    // accounts): the blocking break overlay follows every actor across
    // every page, not only My Work, so it is loaded here rather than
    // per-page. `loadOpenBreak` is request-deduped, so the dashboard page
    // reading the same thing again doesn't cost a second query.
    loadOpenBreak({
      id: session.user.id,
      companyId: session.user.companyId,
      accountType: session.user.accountType,
    }),
  ]);
  const grants = grantRows.map((grant) => grant.permission);
  const avatarUrl = avatarRow?.avatarUrl ?? null;

  const actor = {
    id: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    accountType: session.user.accountType,
    grants,
  };

  const mode: DashboardMode =
    cookieStore.get(DASHBOARD_MODE_COOKIE)?.value === "pms" ? "pms" : "hrms";
  const theme: ThemeMode =
    cookieStore.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

  const navigation = navigationFor(actor, mode);
  const roleLabel =
    actor.accountType === "employee" ? "Employee" : session.user.role;
  const canCreateAnnouncements = canManageAnnouncements(actor);

  return (
    <div
      className="dashboard-theme bg-background text-foreground flex min-h-full flex-1"
      data-theme={theme}
      style={{ "--brand-yellow": brandColor } as React.CSSProperties}
    >
      {/* Design.md section 2: dashboard theme is yellow/white/black, scoped by
          the `dashboard-theme` class above rather than the global tokens, so
          the marketing site keeps its own palette. Sidebar is a white surface
          like the rest of the shell — yellow is reserved for the active item
          and brand accents — so `border-r` is what separates it from `<main>`
          now that they're no longer different colors. Sticky + h-screen keeps
          it pinned to the viewport height instead of stretching (and
          scrolling away) with tall main content. */}
      {/* Collapsed to icon-only (w-16) by default; hovering the whole
          sidebar expands it to its full width (w-60) with labels, via the
          `group`/`group-hover:` pairing on every label below — nothing
          triggers on focus, so keyboard-only navigation still works through
          the always-visible icons and the mobile nav bar below. */}
      {/* Collapsed the aside is w-16 with px-2, leaving exactly 3rem of inner
          width — the same size-9 icon box every row below uses plus its px-1.5.
          That is what keeps icons centred and stationary between the two
          states; widening the padding on hover is part of the same transition. */}
      <aside className="bg-sidebar border-border group hidden w-16 shrink-0 flex-col justify-between overflow-x-hidden border-r px-2 py-4 transition-[width,padding] duration-200 ease-in-out print:hidden hover:w-60 hover:px-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto">
        <div className="flex flex-col gap-4">
          <Link
            href={navigation[0].href}
            aria-label={`${session.user.companyName} home`}
            className="hover:bg-brand-yellow-light flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
          >
            <span className="flex size-9 shrink-0 items-center justify-center">
              <Building2
                aria-hidden
                className="text-brand-brown size-5"
                strokeWidth={1.5}
              />
            </span>
            <span className="text-brand-brown text-h3 hidden min-w-0 truncate font-semibold tracking-tight group-hover:inline-block">
              {session.user.companyName}
            </span>
          </Link>

          {/* Plan: HRMS/PMS toggle — sits between the company name and the
              profile row, Owner/Admin/Manager/HR only (the only four company
              roles); an Employee's nav ignores mode entirely. Hidden while
              the sidebar is collapsed — there's no icon-only form of a
              two-option switch worth showing. */}
          {actor.accountType === "company" ? (
            <div className="hidden group-hover:block">
              <ModeToggle mode={mode} />
            </div>
          ) : null}

          <SidebarNav items={navigation} />
        </div>

        <div className="flex flex-col gap-3">
          <BrandMark
            className="px-1.5"
            logoBoxClassName="size-9"
            labelClassName="text-body hidden font-medium group-hover:inline-block"
          />
          <SignOutButton labelClassName="hidden group-hover:inline-block" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Persistent top bar (Plan: top bar rework) — right-aligned so the
            announcement/notification icons read as sitting beside whatever
            primary action a page's own PageHeader renders, without every
            page needing one. Shown at every screen size; on mobile it also
            carries the WorkPulse wordmark since there's no sidebar there.
            Profile (Plan: reposition profile) is the last, right-most item —
            the top-right corner of the screen — moved here from the sidebar,
            where it used to sit above the nav. */}
        <header className="border-border bg-surface flex items-center justify-between gap-4 border-b px-6 py-3 print:hidden">
          <div className="md:hidden">
            <BrandMark />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <NewChatDialog />
            <AnnouncementBell canCreate={canCreateAnnouncements} />
            <NotificationBell />
            <div className="md:hidden">
              <SignOutButton />
            </div>
            <Link
              href="/profile"
              className="hover:bg-brand-yellow-light flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 transition-colors"
            >
              <span className="hidden min-w-0 text-right sm:block">
                <p className="text-foreground truncate text-sm leading-tight font-medium">
                  {session.user.name}
                </p>
                <p className="text-text-secondary text-meta truncate leading-tight">
                  {roleLabel}
                </p>
              </span>
              <Avatar
                name={session.user.name ?? "?"}
                avatarUrl={avatarUrl}
                className="size-8"
              />
            </Link>
          </div>
        </header>

        <nav
          aria-label="Main"
          className="border-border bg-surface flex gap-1 overflow-x-auto border-b px-4 py-2 print:hidden md:hidden"
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

        {/* Printing any dashboard page (the performance report included)
            hides the chrome above and lets the page use the full sheet
            instead of the app shell's centered column. */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 print:max-w-none print:p-0">
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
