import { type MetadataRoute } from "next";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

interface PublicPageEntry {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

const PUBLIC_PAGES: readonly PublicPageEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/product-tour", changeFrequency: "monthly", priority: 0.8 },
  { path: "/features", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/ai-podcast-clipper", changeFrequency: "monthly", priority: 0.75 },
  { path: "/podcast-to-shorts", changeFrequency: "monthly", priority: 0.75 },
  {
    path: "/youtube-shorts-generator",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Update this only when new pages are added or significant page content changes.
  const LAST_UPDATED = new Date("2026-05-10");

  return PUBLIC_PAGES.map((page) => ({
    url: absoluteSiteUrl(page.path),
    lastModified: LAST_UPDATED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
