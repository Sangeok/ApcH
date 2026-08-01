import { type Metadata } from "next";
import { shortsFaq } from "~/fsd/pages/youtube-shorts-generator/config";
import YoutubeShortsGeneratorPage from "~/fsd/pages/youtube-shorts-generator/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "YouTube Shorts Generator for Podcast Clips",
  description:
    "Generate YouTube Shorts from podcast videos with AI-selected highlights, 1080x1920 vertical framing, and word-level captions.",
  alternates: { canonical: absoluteSiteUrl("/youtube-shorts-generator") },
  openGraph: {
    title: "YouTube Shorts Generator for Podcast Clips",
    description:
      "Vertical, captioned, AI-selected podcast clips ready for YouTube Shorts.",
    locale: "en_US",
    url: absoluteSiteUrl("/youtube-shorts-generator"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(shortsFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <YoutubeShortsGeneratorPage />
    </>
  );
}
