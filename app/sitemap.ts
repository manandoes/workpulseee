import type { MetadataRoute } from "next";

const SITE_URL = "https://workpulse.automovalabs.tech";

/**
 * Static marketing routes only. Tenant `[companySlug]/recruitmentform` pages
 * are deliberately excluded — enumerating them would run a database query on
 * every crawl and publish the customer list. `/privacy`/`/terms`/`/contact`
 * are also excluded while they render `PagePlaceholder` ("not drafted yet");
 * remove that exclusion once real copy lands (see their `robots: noindex`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
