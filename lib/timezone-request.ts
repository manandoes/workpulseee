import { cache } from "react";
import { cookies, headers } from "next/headers";
import { resolveTimeZone, TIMEZONE_COOKIE } from "@/lib/timezone";

export { TIMEZONE_COOKIE };

/** Country-code headers set by common hosting/edge providers — the same pair
 * `lib/pricing.ts`'s `detectPricingCurrency` reads. */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"];

/**
 * The current request's timezone: cookie (accurate) falling back to edge geo
 * (approximate) falling back to UTC (safe). `cache()`d so a page reading it
 * from several places in one render resolves it once, the same way
 * `lib/auth.ts`'s `getActor()` is cached per request.
 */
export const resolveRequestTimeZone = cache(async function resolveRequestTimeZone(): Promise<string> {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);

  const cookieValue = cookieStore.get(TIMEZONE_COOKIE)?.value ?? null;
  const country =
    COUNTRY_HEADERS.map((name) => requestHeaders.get(name)).find(
      (value): value is string => Boolean(value)
    ) ?? null;

  return resolveTimeZone(cookieValue, country);
});
