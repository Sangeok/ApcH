import { type Metadata } from "next";
import { podcastToShortsFaq } from "~/fsd/pages/podcast-to-shorts/config";
import PodcastToShortsPage from "~/fsd/pages/podcast-to-shorts/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Turn Podcasts Into Shorts With AI",
  description:
    "Turn long podcast videos into short-form clips with AI highlight detection, word-level captions, and 1080x1920 vertical framing for Shorts, Reels, and TikTok.",
  alternates: { canonical: absoluteSiteUrl("/podcast-to-shorts") },
  openGraph: {
    title: "Turn Podcasts Into Shorts With AI",
    description:
      "AI Podcast Clipper takes a long-form podcast upload and produces captioned vertical clips.",
    locale: "en_US",
    url: absoluteSiteUrl("/podcast-to-shorts"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(podcastToShortsFaq);

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PodcastToShortsPage />
    </>
  );
}
