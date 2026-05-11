import { type Metadata } from "next";
import { featuresFaq } from "~/fsd/pages/features/config";
import FeaturesPage from "~/fsd/pages/features/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore AI Podcast Clipper features including Q&A highlight detection, WhisperX subtitles, vertical framing, English or Korean captions, and secure S3 storage.",
  alternates: { canonical: absoluteSiteUrl("/features") },
  openGraph: {
    title: "AI Podcast Clipper - Features",
    description:
      "Highlight detection, captions, vertical framing, and selected-language exports in one workflow.",
    locale: "en_US",
    url: absoluteSiteUrl("/features"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(featuresFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FeaturesPage />
    </>
  );
}
