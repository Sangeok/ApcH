import { type Metadata } from "next";
import { productTourFaq } from "~/fsd/pages/product-tour/config";
import ProductTourPage from "~/fsd/pages/product-tour/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

export const metadata: Metadata = {
  title: "Product Tour",
  description:
    "See how AI Podcast Clipper turns a podcast upload into captioned vertical clips ready for YouTube Shorts, Reels, and TikTok.",
  alternates: { canonical: absoluteSiteUrl("/product-tour") },
  openGraph: {
    title: "AI Podcast Clipper - Product Tour",
    description:
      "Watch the upload, highlight detection, captioning, and review steps before you sign up.",
    locale: "en_US",
    url: absoluteSiteUrl("/product-tour"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(productTourFaq);

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <ProductTourPage />
    </>
  );
}
