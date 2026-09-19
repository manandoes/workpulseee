"use client";

import { useEffect } from "react";
import { TIMEZONE_COOKIE } from "@/lib/timezone";

/**
 * Writes the browser's real IANA zone into a cookie so server components can
 * format instants (`formatDateTime`) in the viewer's actual timezone instead
 * of guessing from an IP-geo header. Renders nothing.
 *
 * The very first request from a new visitor has no cookie yet, so that one
 * render falls back to the IP-geo guess in `resolveRequestTimeZone` — accepted
 * rather than worked around with a redirect or a suspense gate, either of
 * which would cost a render cycle on every visit to fix a one-time miss.
 */
export function TimezoneCookie() {
  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;

    // Avoid rewriting the cookie on every navigation once it already matches.
    if (document.cookie.includes(`${TIMEZONE_COOKIE}=${zone}`)) return;

    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return null;
}
