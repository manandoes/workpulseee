"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root-level fallback for a crash above the marketing/dashboard layouts
 * (Next 16's file-conventions/error.md — must render its own <html>/<body>
 * since it replaces the root layout, and must re-import globals.css since
 * layout.tsx's import no longer applies once this replaces it). `retry`,
 * not `reset`, is this version's callback name.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="bg-background text-foreground flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-h2 font-semibold">Something went wrong</h1>
        <p className="text-text-secondary max-w-md">
          WorkPulse hit an unexpected error. Try again, or reload the page.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
