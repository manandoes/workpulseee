"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog — the "save as PDF" path for a slip. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer aria-hidden className="size-4" strokeWidth={1.5} />
      Print / Save as PDF
    </Button>
  );
}
