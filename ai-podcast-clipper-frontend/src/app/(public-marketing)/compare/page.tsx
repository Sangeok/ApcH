import { type Metadata } from "next";
import { comparePages } from "~/fsd/pages/compare/config";
import { CompareIndexPage } from "~/fsd/pages/compare/ui";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Compare Podcast Clipping Workflows",
  description:
    "Compare manual editing and AI-assisted podcast clipping workflows before choosing how to make short-form podcast clips.",
  alternates: { canonical: absoluteSiteUrl("/compare") },
  openGraph: {
    title: "Compare Podcast Clipping Workflows",
    description:
      "Workflow comparisons for podcast creators deciding how to make short-form clips.",
    locale: "en_US",
    url: absoluteSiteUrl("/compare"),
    type: "website",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Podcast clipping workflow comparisons",
    url: absoluteSiteUrl("/compare"),
    hasPart: comparePages.map((page) => ({
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: absoluteSiteUrl(page.href),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CompareIndexPage />
    </>
  );
}
