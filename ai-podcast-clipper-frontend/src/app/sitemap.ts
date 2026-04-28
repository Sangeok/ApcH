import { type MetadataRoute } from "next";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Keep this fixed unless the page content actually changes.
  const LAST_UPDATED = new Date("2026-03-22");

  return [
    {
      url: absoluteSiteUrl("/"),
      lastModified: LAST_UPDATED,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: absoluteSiteUrl("/terms"),
      lastModified: LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteSiteUrl("/privacy"),
      lastModified: LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
