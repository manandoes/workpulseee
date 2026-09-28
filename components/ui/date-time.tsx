"use client";

import { createContext, useContext } from "react";
import { dateTimeParts } from "@/lib/format";
import { DEFAULT_TIME_ZONE } from "@/lib/timezone";

/**
 * The viewer's resolved zone (`lib/timezone-request.ts` — browser cookie,
 * else IP country, else UTC), provided once by `app/(dashboard)/layout.tsx`.
 *
 * A context rather than a prop so server and client components alike render
 * `<DateTime>` without threading the zone through, and so a client component's
 * server render and its hydration format with the same zone rather than the
 * server's and the browser's respectively.
 */
const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) {
  return (
    <TimeZoneContext.Provider value={timeZone}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}

/**
 * An instant as "12 Mar 2026 4:05 PM" — the date in the surrounding text's
 * weight, the time lighter and muted, so the two numbers never blur together.
 */
export function DateTime({
  value,
}: {
  value: Date | string | null | undefined;
}) {
  const timeZone = useTimeZone();
  const parts = dateTimeParts(value, timeZone);
  if (!parts) return <>—</>;

  const iso = (value instanceof Date ? value : new Date(value!)).toISOString();

  return (
    <time dateTime={iso} className="whitespace-nowrap">
      <span className="font-medium">{parts.date}</span>{" "}
      <span className="text-text-secondary font-normal">{parts.time}</span>
    </time>
  );
}
