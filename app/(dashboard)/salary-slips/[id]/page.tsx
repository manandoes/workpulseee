import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadSlip } from "@/lib/payroll-data";
import { formatMoney } from "@/lib/format";
import { periodLabel, toMajor } from "@/lib/payroll";
import { PrintButton } from "@/components/payroll/print-button";

export const metadata: Metadata = { title: "Salary slip" };

/**
 * One slip, laid out for printing (Plan: salary slips).
 *
 * The app shell already hides itself behind `print:hidden`
 * (`app/(dashboard)/layout.tsx`), so "Save as PDF" from the browser yields
 * just this sheet — which is why the feature needs no PDF library.
 *
 * `loadSlip` applies `canViewSalarySlip`, so an employee reaches only their
 * own published slips and payroll roles reach any slip in the company.
 */
export default async function SalarySlipPage({
  params,
}: PageProps<"/salary-slips/[id]">) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const { id } = await params;
  const slip = await loadSlip(actor, id);
  if (!slip) notFound();

  const company = await db.company.findUniqueOrThrow({
    where: { id: actor.companyId },
    select: { name: true, currency: true },
  });

  const earnings = slip.lines.filter((line) => line.kind === "earning");
  const deductions = slip.lines.filter((line) => line.kind === "deduction");
  const money = (minor: number) => formatMoney(toMajor(minor), company.currency);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-text-secondary text-sm">
          Use your browser&apos;s print dialog to save this as a PDF.
        </p>
        <PrintButton />
      </div>

      <article className="border-border bg-surface rounded-xl border p-8 print:rounded-none print:border-0 print:p-0">
        <header className="border-border mb-6 border-b pb-4">
          <h1 className="text-h2 text-brand-brown font-semibold">
            {company.name}
          </h1>
          <p className="text-text-secondary">
            Salary slip · {periodLabel(slip.year, slip.month)}
          </p>
        </header>

        <dl className="mb-6 grid grid-cols-2 gap-2">
          <dt className="text-text-secondary text-sm">Employee</dt>
          <dd className="text-foreground text-right text-sm font-medium">
            {slip.employeeName}
          </dd>
          <dt className="text-text-secondary text-sm">Period</dt>
          <dd className="text-foreground text-right text-sm font-medium">
            {periodLabel(slip.year, slip.month)}
          </dd>
        </dl>

        <SlipSection title="Earnings" lines={earnings} money={money} />
        <SlipSection title="Deductions" lines={deductions} money={money} />

        <div className="border-border mt-6 flex items-baseline justify-between border-t pt-4">
          <span className="text-brand-brown font-semibold">Net pay</span>
          <span className="text-h3 text-brand-brown font-semibold">
            {money(slip.netMinor)}
          </span>
        </div>

        {!slip.published ? (
          <p className="text-warning-text mt-4 text-sm">
            Draft — not yet visible to the employee.
          </p>
        ) : null}
      </article>
    </div>
  );
}

function SlipSection({
  title,
  lines,
  money,
}: {
  title: string;
  lines: { key: string; label: string; amountMinor: number }[];
  money: (minor: number) => string;
}) {
  if (lines.length === 0) return null;

  const total = lines.reduce((sum, line) => sum + line.amountMinor, 0);

  return (
    <section className="mb-4">
      <h2 className="text-brand-brown mb-2 font-medium">{title}</h2>
      <table className="w-full">
        <tbody>
          {lines.map((line) => (
            <tr key={line.key}>
              <td className="text-text-secondary py-1 text-sm">{line.label}</td>
              <td className="text-foreground py-1 text-right text-sm">
                {money(line.amountMinor)}
              </td>
            </tr>
          ))}
          <tr className="border-border border-t">
            <td className="text-foreground py-1 text-sm font-medium">
              Total {title.toLowerCase()}
            </td>
            <td className="text-foreground py-1 text-right text-sm font-medium">
              {money(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
