import { type Metadata } from "next";
import { pricingFaq } from "~/fsd/pages/pricing/config";
import PricingPage from "~/fsd/pages/pricing/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with 3 free credits. Video costs one credit per stored clip; card news, when enabled, costs one per complete set. Manual card-news editing and download are free.",
  alternates: { canonical: absoluteSiteUrl("/pricing") },
  openGraph: {
    title: "AI Podcast Clipper - Pricing",
    description:
      "3-credit trial with shared available and reserved balances for video clips and complete card-news sets.",
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
