"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { cn } from "cn";
import { CredentialViewer } from "@/components/vault/credential-viewer";
import {
  useVaultBrowser,
  VaultBrowser,
} from "@/components/vault/vault-browser";

const POLL_MS = 60_000;
/** Grace period so the pointer can cross the gap from the icon to the panel. */
const HOVER_CLOSE_MS = 250;

/**
 * The client vault's key icon in the top bar (Plan: client vault), beside the
 * announcement and notification bells and built the same way — a plain
 * dropdown, polled, closed on an outside click.
 *
 * Hovering opens it as a preview; clicking the icon, or anything inside the
 * panel, pins it open so ticking credentials and typing a reason cannot be
 * lost to the pointer drifting off. Viewing a credential closes the menu and
 * opens the viewer, which lives outside the panel so it survives the close.
 */
export function VaultKeyMenu({ className }: { className?: string }) {
  const { data, failed, refresh } = useVaultBrowser(POLL_MS);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hovered;

  function close() {
    setPinned(false);
    setHovered(false);
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  function onMouseEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!open) refresh();
    setHovered(true);
  }

  function onMouseLeave() {
    closeTimer.current = setTimeout(() => setHovered(false), HOVER_CLOSE_MS);
  }

  function onIconClick() {
    if (pinned) {
      close();
      return;
    }
    if (!open) refresh();
    setPinned(true);
  }

  const pendingCount = data?.canManage ? data.pendingCount : 0;

  return (
    <>
      <div
        ref={containerRef}
        className={cn("relative", className)}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button
          type="button"
          aria-label={
            pendingCount > 0
              ? `Client vault, ${pendingCount} access requests waiting`
              : "Client vault"
          }
          aria-expanded={open}
          aria-haspopup="true"
          onClick={onIconClick}
          className="text-brand-brown-soft hover:bg-brand-yellow-light hover:text-brand-brown relative flex size-9 items-center justify-center rounded-lg transition-colors"
        >
          <KeyRound aria-hidden className="size-5" strokeWidth={1.5} />
          {pendingCount > 0 ? (
            <span className="bg-danger text-background text-meta absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full font-medium">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </button>

        {open ? (
          <div
            onMouseDown={() => setPinned(true)}
            className="border-border bg-surface absolute top-11 right-0 z-50 flex max-h-112 w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg"
          >
            <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-brand-brown font-medium">Client vault</span>
              {data?.canManage && pendingCount > 0 ? (
                <span className="text-warning-text text-meta">
                  {pendingCount === 1
                    ? "1 request waiting"
                    : `${pendingCount} requests waiting`}
                </span>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto">
              <VaultBrowser
                data={data}
                failed={failed}
                onRequested={refresh}
                onView={(credentialId) => {
                  close();
                  setViewing(credentialId);
                }}
              />
            </div>

            <Link
              href="/vault"
              onClick={close}
              className="border-border text-brand-brown hover:bg-surface-muted border-t px-4 py-2.5 text-center underline-offset-4 hover:underline"
            >
              {data?.canManage ? "Manage vault" : "Open vault"}
            </Link>
          </div>
        ) : null}
      </div>

      {/* Outside the hover container on purpose: React delivers mouseenter
        through portals, so hovering the open dialog would otherwise count as
        hovering the icon and reopen the menu behind it. */}
      <CredentialViewer
        credentialId={viewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
