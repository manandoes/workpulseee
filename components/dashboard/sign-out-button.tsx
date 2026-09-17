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
      className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-foreground w-full justify-start gap-3 px-3"
      onClick={() => signOut({ redirectTo: "/login" })}
    >
      <LogOut aria-hidden className="size-5 shrink-0" strokeWidth={1.5} />
      <span className={cn(labelClassName)}>Sign out</span>
    </Button>
  );
}
