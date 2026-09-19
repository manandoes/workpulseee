import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TimezoneCookie } from "@/components/timezone-cookie";
import "./globals.css";

// Design.md § 4 — Inter is the single typeface used across the product.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://workpulse.automovalabs.tech";
const SITE_NAME = "WorkPulse";
const SITE_DESCRIPTION =
  "An all-in-one operating dashboard for agencies that connects employees, projects, tasks, performance, expenses, and internal operations in one place.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Agency Operations & Employee Management`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_GB",
    title: `${SITE_NAME} — Agency Operations & Employee Management`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Agency Operations & Employee Management`,
    description: SITE_DESCRIPTION,
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TimezoneCookie />
        {children}
      </body>
    </html>
  );
}
