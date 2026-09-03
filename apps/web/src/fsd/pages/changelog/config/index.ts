import type {
  ChangelogEntry,
} from "~/fsd/shared/ui/atoms/resource-card-grid";

export const changelogEntries: ChangelogEntry[] = [
  {
    date: "2026-06-15",
    title: "Public trust and SEO resource pages",
    changes: [
      "Added public guide, comparison, about, contact, security, how-it-works, and changelog pages.",
      "Removed public media pages until first-party or fully licensed footage is available.",
      "Kept sitemap entries and internal links focused on rights-safe public pages.",
    ],
  },
  {
    date: "2026-06-14",
    title: "Search visibility plan",
    changes: [
      "Documented the public content and authority growth plan.",
      "Confirmed the primary issue is small crawlable surface and weak authority signals rather than a search blocking bug.",
    ],
  },
  {
    date: "2026-05-10",
    title: "Public marketing foundation",
    changes: [
      "Published core product, feature, pricing, and solution pages.",
      "Added sitemap and robots configuration for the canonical domain.",
    ],
  },
];
