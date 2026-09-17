import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { loadCurrency } from "@/lib/project-data";
import { loadCompanyFinancials } from "@/lib/financials-data";
import { canViewFinancials, projectSectionsFor } from "@/lib/permissions";
import { formatMoney, formatPercent } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { FinancialsTable } from "@/components/projects/financials-table";

export const metadata: Metadata = { title: "Financials — WorkPulse" };

/**
 * Agency-wide profitability (Phases.md Phase 11): the totals at the top and
 * the per-client rollup table below are the same `financialRollup` arithmetic
 * (`lib/projects.ts`) applied to two different slices of projects —
 * everything, and one client's worth.
 *
 * Owner/Admin only (`canViewFinancials`), narrower than the rest of the
 * Projects section: a Manager can already see any individual project's own
 * margin on `/projects/[id]`, but not this company-wide total. Redirects to
 * `/projects`, the section root, the same precedent `/employees/accounts`
 * sets for a narrower-permission page under a wider-access section.
 */
export default async function FinancialsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!canViewFinancials(actor)) redirect("/projects");

  const [currency, financials] = await Promise.all([
    loadCurrency(actor),
    loadCompanyFinancials(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Financials"
        description="Revenue, cost and margin per client and across your agency."
      />

      <SectionTabs
        label="Projects sections"
        items={projectSectionsFor(actor)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Total value"
          value={formatMoney(financials.agency.value, currency)}
        />
        <MetricTile
          label="Total cost"
          value={formatMoney(financials.agency.estimatedCost, currency)}
        />
        <MetricTile
          label="Margin"
          value={formatMoney(financials.agency.margin, currency)}
        />
        <MetricTile
          label="Margin %"
          value={formatPercent(financials.agency.marginPercent)}
        />
      </div>

      {financials.clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Once you add clients and projects, their revenue, cost and margin will roll up here."
        />
      ) : (
        <FinancialsTable clients={financials.clients} currency={currency} />
      )}
    </>
  );
}
