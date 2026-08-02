import { type MetadataRoute } from "next";
import { comparePages } from "~/fsd/pages/compare/config";
import { guidePages } from "~/fsd/pages/guides/config";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

interface PublicPageEntry {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
  lastModified?: string;
}

const PUBLIC_PAGES: readonly PublicPageEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  {
    path: "/about",
    changeFrequency: "monthly",
    priority: 0.55,
    lastModified: "2026-06-15",
  },
  {
    path: "/contact",
    changeFrequency: "monthly",
    priority: 0.45,
    lastModified: "2026-06-15",
  },
  {
    path: "/security",
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: "2026-06-15",
  },
  {
    path: "/how-it-works",
    changeFrequency: "monthly",
    priority: 0.8,
    lastModified: "2026-06-15",
  },
  {
    path: "/changelog",
    changeFrequency: "monthly",
    priority: 0.5,
    lastModified: "2026-06-15",
  },
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
  {
    path: "/guides",
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: "2026-06-15",
  },
  ...guidePages.map((guide) => ({
    path: `/guides/${guide.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.72,
    lastModified: guide.updatedAt,
  })),
  {
    path: "/compare",
    changeFrequency: "monthly",
    priority: 0.65,
    lastModified: "2026-06-15",
  },
  ...comparePages.map((page) => ({
    path: page.href,
    changeFrequency: "monthly" as const,
    priority: 0.62,
    lastModified: "2026-06-15",
  })),
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Update this only when new pages are added or significant page content changes.
  const LAST_UPDATED = new Date("2026-05-10");

  return PUBLIC_PAGES.map((page) => ({
    url: absoluteSiteUrl(page.path),
    lastModified: page.lastModified
      ? new Date(page.lastModified)
      : LAST_UPDATED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
