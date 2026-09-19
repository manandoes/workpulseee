"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

export function SignOutButton({
  labelClassName,
}: {
  /** Lets the collapsible sidebar hide the label until hovered, without
   * affecting the other places this button is rendered (e.g. the mobile
   * topbar), which pass nothing and keep the label always visible. */
  labelClassName?: string;
}) {
  return (
    <Button
      variant="ghost"
      className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown h-auto w-full justify-start gap-2 px-1.5 py-1"
      onClick={() => signOut({ redirectTo: "/login" })}
    >
      <span className="flex size-9 shrink-0 items-center justify-center">
        <LogOut aria-hidden className="size-5" strokeWidth={1.5} />
      </span>
      <span className={cn(labelClassName)}>Sign out</span>
    </Button>
  );
}
