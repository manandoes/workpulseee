"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

/**
 * Toasts, styled to Design.md section 9: top-right, flat, `surface`
 * background with a thin status-coloured left border rather than a fully
 * coloured fill. Success auto-dismisses after 4s; errors stay until dismissed.
 *
 * The stock shadcn version reads the theme via `next-themes`. WorkPulse is
 * light-only for v1 (Design.md section 2), so the theme is pinned instead.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-right"
      duration={4000}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="text-success size-4" />,
        info: <InfoIcon className="text-info size-4" />,
        warning: <TriangleAlertIcon className="text-warning size-4" />,
        error: <OctagonXIcon className="text-danger size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast border-l-4 shadow-sm",
          success: "border-l-success",
          error: "border-l-danger",
          warning: "border-l-warning",
          info: "border-l-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
