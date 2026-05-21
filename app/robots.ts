import type { MetadataRoute } from "next";

/**
 * Robots policy — block admin, API, and onboarding paths from indexing.
 * Public-facing routes (jobs, talent profiles, workspaces) remain crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/onboarding"],
      },
    ],
    // TODO: wire a dynamic sitemap (app/sitemap.ts) listing public jobs,
    // talent profiles, and workspace landing pages.
  };
}
