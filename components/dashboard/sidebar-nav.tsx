"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  Contact,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  ReceiptText,
  Settings,
  TrendingUp,
  UserRoundSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { NavItem } from "@/lib/permissions";
import { ChatNavBadge } from "@/components/dashboard/chat-nav-badge";

/**
 * `navigationFor` returns icon names rather than components so that the
 * permission rules stay a plain, testable module with no React imports.
 */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  FolderKanban,
  ListChecks,
  TrendingUp,
  ClipboardCheck,
  Settings,
  MessageCircle,
  Contact,
  CalendarDays,
  Megaphone,
  Mail,
  ReceiptText,
  UserRoundSearch,
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        // Exact match, or a child route — but "/my-space" must not light up
        // for "/my-space/growth" only by prefix accident.
        const isActive =
          pathname === item.href ||
          (item.href !== "/my-space" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors",
              isActive
                ? // Box-shadow tinted with the same --brand-yellow variable
                  // the active fill uses, so it follows whatever color the
                  // Owner picks (Plan: brand color) with no JS needed.
                  "bg-brand-yellow text-primary-foreground shadow-[0_2px_10px_-2px_var(--brand-yellow)] font-medium"
                : "text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown"
            )}
          >
            {/* Fixed-size box rather than a bare icon: collapsed, the sidebar
                leaves exactly this much room, so the icon stays centred and
                does not shift horizontally as the label appears on hover. */}
            <span className="flex size-9 shrink-0 items-center justify-center">
              <Icon aria-hidden className="size-5" strokeWidth={1.5} />
            </span>
            <span className="hidden truncate group-hover:inline-block">
              {item.label}
            </span>
            {item.href === "/chat" ? <ChatNavBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
