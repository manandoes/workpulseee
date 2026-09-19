import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root. Without this, Next walks up past the project and
    // picks up an unrelated lockfile outside the repository.
    root: path.resolve(__dirname),
  },
  async headers() {
    // Vercel already terminates TLS and redirects HTTP → HTTPS, so HSTS is
    // the one piece of "enforce HTTPS" actually left to configure here.
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
