import { type Metadata } from "next";
import { howItWorksFaq, howItWorksSteps } from "~/fsd/pages/how-it-works/config";
import { HowItWorksPage } from "~/fsd/pages/how-it-works/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "See how AI Podcast Clipper processes podcast uploads with transcription, AI highlight selection, active speaker framing, captions, rendering, and dashboard review.",
  alternates: { canonical: absoluteSiteUrl("/how-it-works") },
  openGraph: {
    title: "How AI Podcast Clipper Works",
    description:
      "The podcast-to-shorts pipeline: upload, transcript, highlight selection, speaker framing, captions, rendering, and review.",
    locale: "en_US",
    url: absoluteSiteUrl("/how-it-works"),
    type: "website",
  },
};

export default function Page() {
  const howToJsonLd = {
    "@type": "HowTo",
    name: "How AI Podcast Clipper turns podcasts into Shorts",
    description:
      "A high-level overview of the upload, transcription, highlight selection, framing, captioning, rendering, and review process.",
    step: howItWorksSteps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.description,
    })),
  };
  const faqJsonLd = generateFaqJsonLd(howItWorksFaq);

  return (
    <>
      <JsonLd data={{
            "@context": "https://schema.org",
            "@graph": [howToJsonLd, faqJsonLd],
          }} />
      <HowItWorksPage />
    </>
  );
}
