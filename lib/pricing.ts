import { headers } from "next/headers";

/**
 * Country-code headers set by common hosting/edge providers. `NextRequest`'s
 * own `geo`/`ip` were removed in Next 15 — providers now surface this via
 * plain request headers instead (see next.js upgrade guide, "NextRequest
 * Geolocation").
 */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"];

export type Currency = "INR" | "USD";

/**
 * India sees INR; everywhere else (and anywhere we can't tell, e.g.
 * self-hosted deployments without an edge geo header) sees USD.
 */
export async function detectPricingCurrency(): Promise<Currency> {
  const requestHeaders = await headers();

  const country = COUNTRY_HEADERS.map((name) =>
    requestHeaders.get(name)
  ).find((value): value is string => Boolean(value));

  return country?.toUpperCase() === "IN" ? "INR" : "USD";
}
