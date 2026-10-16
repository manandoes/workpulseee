"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";

/**
 * Floating action button that opens the feedback/enhancement dialog (Plan:
 * software feedback button).
 *
 * Fixed at the bottom-right of the viewport, visible to every signed-in
 * actor — employee, manager, owner — since anyone can submit feedback
 * about WorkPulse.
 *
 * Uses the initializer function form of useState so the SSR → client
 * hydration mismatch warning is avoided without needing an effect.
 */
export function FeedbackFAB() {
  // `useSyncExternalStore` with the client window object is overkill for this;
  // the initializer form of useState is the standard pattern in this codebase
  // for "true after first paint" booleans (see `components/dashboard/avatar`).
  const [mounted] = useState(() => true);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Send feedback or enhancement"
        className="bg-brand-yellow hover:bg-brand-yellow-hover fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
      >
        <MessageCircle aria-hidden className="size-6 text-brand-brown" strokeWidth={1.5} />
      </button>
      {mounted ? (
        <FeedbackDialog open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  );
}
