import {
  OG_IMAGE_PATH,
  SITE_NAME,
  SITE_URL,
  absoluteSiteUrl,
} from "~/fsd/shared/lib/site";

/**
 * WebApplication JSON-LD for the landing page.
 * @see https://schema.org/WebApplication
 */
export function generateWebApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Automatically turn your podcast into short-form highlight clips with AI.",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free trial (3 credits)",
    },
    featureList: [
      "AI Q&A-Based Auto Clipping",
      "WhisperX Word-Level Subtitles",
      "Auto Vertical Framing",
      "English & Korean Dual Subtitles",
      "AWS S3 Secure Storage",
      "Dashboard Review Loop",
    ],
    screenshot: absoluteSiteUrl(OG_IMAGE_PATH),
  };
}
