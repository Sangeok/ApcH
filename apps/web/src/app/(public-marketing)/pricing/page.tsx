import { type Metadata } from "next";
import { pricingFaq } from "~/fsd/pages/pricing/config";
import PricingPage from "~/fsd/pages/pricing/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AI Podcast Clipper pricing - start with 3 free credits. Credits are deducted after a successful processing run with captions, vertical framing, and selected-language export.",
  alternates: { canonical: absoluteSiteUrl("/pricing") },
  openGraph: {
    title: "AI Podcast Clipper - Pricing",
    description:
      "Free trial with 3 credits plus plan details for podcast-to-shorts workflows.",
    locale: "en_US",
    url: absoluteSiteUrl("/pricing"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(pricingFaq);

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <PricingPage />
    </>
  );
}
