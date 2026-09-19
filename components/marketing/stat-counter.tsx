"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A single glowing digit stat, counting up once it scrolls into view —
 * donated from the "nixie-tube laboratory counter" concept weighed during
 * this page's direction round: an instrument reading, not a plain numeral.
 *
 * Every value here is a real, structural fact about the product (module
 * count, role count, steps to launch) — never a fabricated usage or customer
 * metric; PRODUCT.md is explicit that no real customer numbers exist yet.
 */
export function StatCounter({
  value,
  suffix = "",
  label,
}: {
  value: number;
  suffix?: string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) {
      // Deferred to a timer rather than called synchronously in the effect
      // body, the same pattern `notification-bell.tsx`'s poll uses
      // (react-hooks/set-state-in-effect).
      const id = setTimeout(() => setDisplay(value), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const durationMs = 900;
        const start = performance.now();

        function tick(now: number) {
          const progress = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3); // exponential ease-out
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 text-center">
      <span
        aria-hidden
        className="text-brand-yellow text-5xl font-black tabular-nums [text-shadow:0_0_18px_var(--brand-yellow)] sm:text-6xl"
      >
        {display}
        {suffix}
      </span>
      <span className="sr-only">{`${value}${suffix} — ${label}`}</span>
      <span className="text-background/80 text-sm font-medium">{label}</span>
    </div>
  );
}
