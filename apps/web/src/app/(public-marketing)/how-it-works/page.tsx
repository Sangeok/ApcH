import { type Metadata } from "next";
import {
  howItWorksFaq,
  howItWorksSteps,
} from "~/fsd/pages/how-it-works/config";
import { HowItWorksPage } from "~/fsd/pages/how-it-works/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "See the podcast-to-shorts workflow and optional completed-clip card news: source-grounded text, original-video cover, free manual edits, JPG/ZIP and Instagram copy.",
  alternates: { canonical: absoluteSiteUrl("/how-it-works") },
  openGraph: {
    title: "How AI Podcast Clipper Works",
    description:
      "Upload, generate clips, review and download. When enabled, turn a completed clip into card-news files and copy for manual Instagram posting.",
    locale: "en_US",
    url: absoluteSiteUrl("/how-it-works"),
    type: "website",
  },
};

export default function Page() {
  const howToJsonLd = {
    "@type": "HowTo",
    name: "How AI Podcast Clipper creates Shorts and optional card news",
    description:
      "Upload, transcribe, select highlights, frame and caption video, then review or generate a separate card-news set when enabled.",
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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [howToJsonLd, faqJsonLd],
        }}
      />
      <HowItWorksPage />
    </>
  );
}
