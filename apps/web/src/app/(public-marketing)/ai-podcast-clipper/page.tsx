import { type Metadata } from "next";
import { clipperFaq } from "~/fsd/pages/ai-podcast-clipper/config";
import AiPodcastClipperPage from "~/fsd/pages/ai-podcast-clipper/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Long-Form Podcast Video Clipper",
  description:
    "AI Podcast Clipper turns long-form podcast video into Q&A highlight clips with word-level captions and vertical 1080x1920 framing.",
  alternates: { canonical: absoluteSiteUrl("/ai-podcast-clipper") },
  openGraph: {
    title: "AI Podcast Clipper for Long-Form Podcast Video",
    description:
      "Highlight detection, captions, and vertical framing for podcast hosts and creators.",
    locale: "en_US",
    url: absoluteSiteUrl("/ai-podcast-clipper"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(clipperFaq);

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <AiPodcastClipperPage />
    </>
  );
}
