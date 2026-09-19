import type { MetadataRoute } from "next";

const SITE_URL = "https://workpulse.automovalabs.tech";

/**
 * `PROTECTED_PREFIXES` mirrors `proxy.ts` — everything requiring a session is
 * disallowed here too, plus the auth pages and API routes a crawler has no
 * business indexing.
 */
export default function robots(): MetadataRoute.Robots {
  // Preview/branch deployments should never be indexed — only the production
  // domain gets a permissive robots.txt.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/employees",
        "/projects",
        "/tasks",
        "/performance",
        "/requests",
        "/my-space",
        "/settings",
        "/notifications",
        "/squad",
        "/chat",
        "/calendar",
        "/announcements",
        "/payroll",
        "/communications",
        "/salary-slips",
        "/hiring",
        "/billing",
        "/login",
        "/register",
        "/invite/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
