import Link from "next/link";
import { BrandMark } from "@/components/marketing/brand-mark";

/**
 * Auth shell — centred card on the cream background (Design.md section 8).
 * The forms themselves are built in Phase 2.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-background flex min-h-full flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <Link href="/" aria-label="WorkPulse home">
        <BrandMark />
      </Link>
      <main className="w-full max-w-md">{children}</main>
      <Link
        href="/"
        className="text-text-secondary hover:text-brand-brown text-meta rounded-sm transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
