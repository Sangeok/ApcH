const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://podcastclipper.com";
const SITE_NAME = "AI Podcast Clipper";

/**
 * WebApplication JSON-LD — 홈페이지용
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
    screenshot: `${SITE_URL}/og-image.png`,
  };
}
