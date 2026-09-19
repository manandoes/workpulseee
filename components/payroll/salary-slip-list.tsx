"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { periodLabel, toMajor } from "@/lib/payroll";

type Slip = {
  id: string;
  month: number;
  year: number;
  netMinor: number;
  uploadedFileId: string | null;
};

/**
 * An employee's own salary slips, grouped by year (Plan: salary slips).
 *
 * A slip HR uploaded as a PDF downloads directly; a generated one opens its
 * print view, which the browser saves as a PDF. Both read as "download" to the
 * person, which is why they sit in one list rather than two.
 */
export function SalarySlipList({
  slips,
  currency,
}: {
  slips: Slip[];
  currency: string;
}) {
  const years = Array.from(new Set(slips.map((slip) => slip.year))).sort(
    (a, b) => b - a
  );
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());

  if (slips.length === 0) {
    return (
      <p className="text-text-secondary text-sm">
        No salary slips have been published for you yet.
      </p>
    );
  }

  const visible = slips.filter((slip) => slip.year === year);

  return (
    <div className="flex flex-col gap-3">
      {years.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slip-year" className="text-brand-brown text-sm font-medium">
            Year
          </label>
          <select
            id="slip-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="border-input bg-surface text-foreground w-40 rounded-lg border px-3 py-2 text-sm"
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-lg border">
        {visible.map((slip) => (
          <li
            key={slip.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileText
                aria-hidden
                className="text-brand-brown-soft size-4 shrink-0"
                strokeWidth={1.5}
              />
              <span className="text-foreground truncate text-sm">
                {periodLabel(slip.year, slip.month)}
              </span>
            </span>

            <span className="text-text-secondary text-meta shrink-0">
              {formatMoney(toMajor(slip.netMinor), currency)}
            </span>

            {slip.uploadedFileId ? (
              <a
                href={`/api/files/${slip.uploadedFileId}`}
                className="text-brand-brown hover:text-brand-brown-soft inline-flex shrink-0 items-center gap-1 text-sm font-medium"
              >
                <Download aria-hidden className="size-4" strokeWidth={1.5} />
                Download
              </a>
            ) : (
              <Link
                href={`/salary-slips/${slip.id}`}
                className="text-brand-brown hover:text-brand-brown-soft inline-flex shrink-0 items-center gap-1 text-sm font-medium"
              >
                <Download aria-hidden className="size-4" strokeWidth={1.5} />
                Download
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
