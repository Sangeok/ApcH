import { type Metadata } from "next";
import { securityFaq } from "~/fsd/pages/resources/config";
import { SecurityPage } from "~/fsd/pages/resources/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Security and Data Handling",
  description:
    "How AI Podcast Clipper handles private podcast uploads, signed URLs, S3 storage, generated clips, and creator review responsibilities.",
  alternates: { canonical: absoluteSiteUrl("/security") },
  openGraph: {
    title: "AI Podcast Clipper - Security and Data Handling",
    description:
      "Private upload handling, signed URLs, authenticated access, and creator review boundaries.",
    locale: "en_US",
    url: absoluteSiteUrl("/security"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(securityFaq);

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Security and Data Handling",
    url: absoluteSiteUrl("/security"),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [webPageJsonLd, faqJsonLd],
          }),
        }}
      />
      <SecurityPage />
    </>
  );
}
