import { type Metadata } from "next";
import { guidePages } from "~/fsd/pages/guides/config";
import { GuidesIndexPage } from "~/fsd/pages/guides/ui";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Podcast Clipping Guides",
  description:
    "Guides for making podcast clips, choosing Shorts length, adding captions, and repurposing long-form podcast episodes.",
  alternates: { canonical: absoluteSiteUrl("/guides") },
  openGraph: {
    title: "Podcast Clipping Guides",
    description:
      "Practical guides for podcast creators turning long-form episodes into Shorts, Reels, and TikTok-ready clips.",
    locale: "en_US",
    url: absoluteSiteUrl("/guides"),
    type: "website",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Podcast clipping guides",
    url: absoluteSiteUrl("/guides"),
    hasPart: guidePages.map((guide) => ({
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      url: absoluteSiteUrl(`/guides/${guide.slug}`),
      dateModified: guide.updatedAt,
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <GuidesIndexPage />
    </>
  );
}
