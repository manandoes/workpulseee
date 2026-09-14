"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Contact,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Settings,
  TrendingUp,
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
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
              isActive
                ? "bg-brand-yellow text-foreground font-medium"
                : "text-brand-brown-soft hover:bg-brand-yellow-light hover:text-foreground"
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
            {item.label}
            {item.href === "/chat" ? <ChatNavBadge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
