import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Design.md § 4 — Inter is the single typeface used across the product.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkPulse — Agency Operations & Employee Management",
  description:
    "An all-in-one operating dashboard for agencies that connects employees, projects, tasks, performance, expenses, and internal operations in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
