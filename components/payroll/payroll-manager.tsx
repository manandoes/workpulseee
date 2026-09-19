"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import {
  computeTotals,
  linesFromComponents,
  monthName,
  toMajor,
  toMajorInput,
  toMinor,
  type SalaryComponent,
  type SlipLine,
} from "@/lib/payroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";

type Employee = { id: string; fullName: string; employeeCode: string };
type Slip = {
  id: string;
  employeeId: string;
  employeeName: string;
  netMinor: number;
  published: boolean;
  uploadedFileId: string | null;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * Payroll for one month (Plan: salary slips).
 *
 * Two ways to produce a slip, both here: fill the company's structure for an
 * employee, or upload a finished PDF. The structure itself is edited in the
 * panel above the table, because changing it is what the first run of a new
 * month usually starts with.
 */
export function PayrollManager({
  employees,
  components: initialComponents,
  currency,
}: {
  employees: Employee[];
  components: SalaryComponent[];
  currency: string;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [components, setComponents] = useState(initialComponents);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [lines, setLines] = useState<SlipLine[]>([]);
  const [upload, setUpload] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch(
      `/api/salary-slips?year=${year}&month=${month}`
    );
    if (!response.ok) return;
    const data = await response.json();
    setSlips(data.slips);
  }

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function saveTemplate() {
    setBusy(true);
    try {
      const response = await fetch("/api/salary-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ components }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not save the structure.");
        return;
      }
      toast.success("Salary structure saved.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing(employeeId: string) {
    const existing = slips.find((slip) => slip.employeeId === employeeId);
    setEditing(employeeId);
    setUpload([]);
    // An existing slip is edited from its own stored lines; a new one starts
    // from the company structure.
    if (existing) {
      fetch(`/api/salary-slips?year=${year}&month=${month}`)
        .then((response) => response.json())
        .then(() => setLines(linesFromComponents(components)));
    } else {
      setLines(linesFromComponents(components));
    }
  }

  async function saveSlip(employeeId: string, published: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/salary-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          year,
          month,
          lines,
          uploadedFileId: upload[0]?.id ?? null,
          published,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(data?.error ?? "Could not save that slip.");
        return;
      }

      toast.success(published ? "Slip published." : "Draft saved.");
      setEditing(null);
      setUpload([]);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeSlip(slipId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/salary-slips/${slipId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error("Could not delete that slip.");
        return;
      }
      toast.success("Slip deleted.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const totals = computeTotals(lines);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="payroll-month" className="text-brand-brown text-sm font-medium">
            Month
          </label>
          <select
            id="payroll-month"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="border-input bg-surface text-foreground rounded-lg border px-3 py-2 text-sm"
          >
            {MONTHS.map((option) => (
              <option key={option} value={option}>
                {monthName(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="payroll-year" className="text-brand-brown text-sm font-medium">
            Year
          </label>
          <Input
            id="payroll-year"
            type="number"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-28"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          Salary structure
        </h2>
        <p className="text-text-secondary text-meta">
          The lines every generated slip starts from. Amounts here are defaults
          you can override per employee.
        </p>

        <ul className="flex flex-col gap-2">
          {components.map((component, index) => (
            <li key={component.key} className="flex flex-wrap items-center gap-2">
              <Input
                value={component.label}
                aria-label="Component name"
                onChange={(event) =>
                  setComponents((previous) =>
                    previous.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item
                    )
                  )
                }
                className="w-56"
              />
              <select
                value={component.kind}
                aria-label="Component kind"
                onChange={(event) =>
                  setComponents((previous) =>
                    previous.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            kind: event.target.value as SalaryComponent["kind"],
                          }
                        : item
                    )
                  )
                }
                className="border-input bg-surface text-foreground rounded-lg border px-3 py-2 text-sm"
              >
                <option value="earning">Earning</option>
                <option value="deduction">Deduction</option>
              </select>
              <Input
                type="number"
                step="0.01"
                aria-label="Default amount"
                value={toMajorInput(component.defaultMinor)}
                onChange={(event) =>
                  setComponents((previous) =>
                    previous.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, defaultMinor: toMinor(event.target.value) }
                        : item
                    )
                  )
                }
                className="w-36"
              />
              <button
                type="button"
                aria-label={`Remove ${component.label}`}
                className="text-brand-brown-soft hover:text-danger-text"
                onClick={() =>
                  setComponents((previous) =>
                    previous.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setComponents((previous) => [
                ...previous,
                {
                  key: `component-${Date.now()}`,
                  label: "New component",
                  kind: "earning",
                  defaultMinor: 0,
                },
              ])
            }
          >
            <Plus aria-hidden className="size-4" strokeWidth={1.5} />
            Add component
          </Button>
          <Button type="button" size="sm" onClick={saveTemplate} disabled={busy}>
            Save structure
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3 text-brand-brown font-semibold">
          {monthName(month)} {year}
        </h2>

        <ul className="border-border divide-border bg-surface flex flex-col divide-y overflow-hidden rounded-xl border">
          {employees.map((employee) => {
            const slip = slips.find((item) => item.employeeId === employee.id);
            const isEditing = editing === employee.id;

            return (
              <li key={employee.id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-foreground block truncate font-medium">
                      {employee.fullName}
                    </span>
                    <span className="text-text-secondary text-meta">
                      {employee.employeeCode}
                      {slip
                        ? ` · ${formatMoney(toMajor(slip.netMinor), currency)} · ${
                            slip.published ? "Published" : "Draft"
                          }`
                        : " · No slip"}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {slip ? (
                      <>
                        <Link
                          href={`/salary-slips/${slip.id}`}
                          className="text-brand-brown hover:text-brand-brown-soft text-sm font-medium"
                        >
                          View
                        </Link>
                        <button
                          type="button"
                          aria-label={`Delete ${employee.fullName}'s slip`}
                          className="text-brand-brown-soft hover:text-danger-text"
                          disabled={busy}
                          onClick={() => removeSlip(slip.id)}
                        >
                          <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                        </button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        isEditing ? setEditing(null) : startEditing(employee.id)
                      }
                    >
                      {isEditing ? "Cancel" : slip ? "Edit" : "Create slip"}
                    </Button>
                  </span>
                </div>

                {isEditing ? (
                  <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
                    <ul className="flex flex-col gap-2">
                      {lines.map((line, index) => (
                        <li key={line.key} className="flex items-center gap-2">
                          <span className="text-text-secondary flex-1 text-sm">
                            {line.label}
                            <span className="text-meta ml-1">
                              ({line.kind})
                            </span>
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            aria-label={`${line.label} amount`}
                            value={toMajorInput(line.amountMinor)}
                            onChange={(event) =>
                              setLines((previous) =>
                                previous.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        amountMinor: toMinor(event.target.value),
                                      }
                                    : item
                                )
                              )
                            }
                            className="w-36"
                          />
                        </li>
                      ))}
                    </ul>

                    <div className="text-text-secondary flex justify-between text-sm">
                      <span>
                        Gross {formatMoney(toMajor(totals.grossMinor), currency)} ·
                        Deductions{" "}
                        {formatMoney(toMajor(totals.deductionMinor), currency)}
                      </span>
                      <span className="text-brand-brown font-medium">
                        Net {formatMoney(toMajor(totals.netMinor), currency)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-brand-brown text-sm font-medium">
                        Or upload a finished slip
                      </span>
                      <p className="text-text-secondary text-meta">
                        An uploaded PDF replaces the breakdown above when the
                        employee downloads it.
                      </p>
                      <FileUpload
                        value={upload}
                        onChange={setUpload}
                        multiple={false}
                        accept="application/pdf"
                        label="Upload slip"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => saveSlip(employee.id, true)}
                      >
                        Publish
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => saveSlip(employee.id, false)}
                      >
                        Save draft
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
