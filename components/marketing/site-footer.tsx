import Link from "next/link";
import { BrandMark } from "@/components/marketing/brand-mark";

/**
 * Public footer. PRD.md section 6.0 requires links to login, contact and
 * terms/privacy.
 */
const FOOTER_COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Sign in",
    links: [
      { href: "/login/company", label: "Company Login" },
      { href: "/login/employee", label: "Employee Login" },
      { href: "/register", label: "Create a company account" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-border bg-surface-muted border-t">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <BrandMark />
            <p className="text-text-secondary text-meta">
              Agency operations, employee management, and performance in one
              place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:gap-16">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <h3 className="text-brand-brown text-meta font-semibold tracking-wide uppercase">
                  {column.heading}
                </h3>
                <ul className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-text-secondary hover:text-brand-brown rounded-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-border mt-10 border-t pt-6">
          <p className="text-text-secondary text-meta">
            &copy; {new Date().getFullYear()} WorkPulse. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
