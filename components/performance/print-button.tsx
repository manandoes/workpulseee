"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Triggers the browser's native print dialog on the report page beneath it
 * — "Save as PDF" from there is the actual download, per the chosen
 * print-friendly-HTML approach. `print:hidden` on the dashboard shell
 * (`app/(dashboard)/layout.tsx`) keeps the sidebar/header out of the output,
 * and this button hides itself the same way so it never appears on the page.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="print:hidden"
      onClick={() => window.print()}
    >
      <Download aria-hidden className="size-4" />
      Download report
    </Button>
  );
}
