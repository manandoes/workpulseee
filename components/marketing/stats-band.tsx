import { StatCounter } from "@/components/marketing/stat-counter";

/**
 * A band of real, structural facts about the product — never fabricated
 * usage, customer, or benchmark numbers (PRODUCT.md: no real customers or
 * benchmarks exist yet). Rendered on the same brand-brown surface `CtaBand`
 * already uses as a dark tile, so the glowing digit treatment stays inside
 * the established palette rather than introducing a foreign dark theme.
 */
const STATS = [
  { value: 7, label: "Core modules, one dashboard" },
  { value: 4, label: "Roles with their own permissions" },
  { value: 4, label: "Steps from signup to live" },
  { value: 100, suffix: "%", label: "Of every query is tenant-scoped" },
] as const;

export function StatsBand() {
  return (
    <section className="w-full px-6 py-16 sm:py-20">
      <div className="bg-brand-brown mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-8 rounded-lg px-8 py-12 sm:px-12 lg:grid-cols-4">
        {STATS.map((stat) => (
          <StatCounter key={stat.label} {...stat} />
        ))}
      </div>
    </section>
  );
}
