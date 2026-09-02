import { type Metadata } from "next";
import { changelogEntries } from "~/fsd/pages/resources/config";
import { ChangelogPage } from "~/fsd/pages/resources/ui";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Public product updates and SEO surface changes for AI Podcast Clipper.",
  alternates: { canonical: absoluteSiteUrl("/changelog") },
  openGraph: {
    title: "AI Podcast Clipper Changelog",
    description:
      "Visible product, public content, and workflow updates for AI Podcast Clipper.",
    locale: "en_US",
    url: absoluteSiteUrl("/changelog"),
    type: "website",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "AI Podcast Clipper changelog",
    itemListElement: changelogEntries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.title,
      description: entry.changes.join(" "),
      datePublished: entry.date,
      url: absoluteSiteUrl("/changelog"),
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <ChangelogPage />
    </>
  );
}
