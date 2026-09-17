"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/brand-mark";

/**
 * Public marketing header.
 *
 * PRD.md section 6.0 requires two distinct entry points in the nav —
 * "Company Login" and "Employee Login" — because the two audiences
 * authenticate against different schemas and land in different experiences.
 *
 * Section links are absolute (`/#features`) so they work from the standalone
 * /features, /pricing and /faq pages as well as the landing page.
 */
const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="border-border bg-background/95 sticky top-0 z-50 w-full border-b backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-6 px-6">
        <Link href="/" aria-label="WorkPulse home">
          <BrandMark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-text-secondary hover:text-brand-brown rounded-sm transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="outline">
            <Link href="/login/employee">Employee Login</Link>
          </Button>
          <Button asChild>
            <Link href="/login/company">Company Login</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {mobileMenuOpen ? (
        <div
          id="mobile-menu"
          className="border-border bg-background border-t md:hidden"
        >
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-6 py-4"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-text-secondary hover:text-brand-brown hover:bg-surface-muted rounded-lg px-2 py-2 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Button asChild variant="outline">
                <Link
                  href="/login/employee"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Employee Login
                </Link>
              </Button>
              <Button asChild>
                <Link
                  href="/login/company"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Company Login
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
