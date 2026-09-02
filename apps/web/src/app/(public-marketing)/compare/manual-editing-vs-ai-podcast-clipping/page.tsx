import { type Metadata } from "next";
import { manualEditingComparison } from "~/fsd/pages/compare/config";
import { ManualEditingComparisonPage } from "~/fsd/pages/compare/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Manual Editing vs AI Podcast Clipping",
  description:
    "Compare manual editing with AI-assisted podcast clipping for long-form podcast episodes, captions, vertical framing, and review workflows.",
  alternates: {
    canonical: absoluteSiteUrl(
      "/compare/manual-editing-vs-ai-podcast-clipping",
    ),
  },
  openGraph: {
    title: manualEditingComparison.title,
    description: manualEditingComparison.description,
    locale: "en_US",
    url: absoluteSiteUrl("/compare/manual-editing-vs-ai-podcast-clipping"),
    type: "website",
  },
};

export default function Page() {
  const breadcrumbJsonLd = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Compare",
        item: absoluteSiteUrl("/compare"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: manualEditingComparison.title,
        item: absoluteSiteUrl("/compare/manual-editing-vs-ai-podcast-clipping"),
      },
    ],
  };

  const faqJsonLd = generateFaqJsonLd(manualEditingComparison.faq);

  return (
    <>
      <JsonLd data={{
            "@context": "https://schema.org",
            "@graph": [breadcrumbJsonLd, faqJsonLd],
          }} />
      <ManualEditingComparisonPage />
    </>
  );
}
